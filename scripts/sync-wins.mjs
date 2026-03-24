import fs from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env.local");
const CSV_PATH = path.join(ROOT, "all_gtmx_wins_2026-03-24T0041.csv");
// Full Supabase export — used as source of truth for preserved fields
const OLD_EXPORT_PATH = path.join(ROOT, "Supabase Snippet Metrics Calls Table.csv");
const UPSERT_BATCH_SIZE = 500;
const DELETE_BATCH_SIZE = 500;

function parseEnvValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function readEnvFile() {
  const envRaw = await fs.readFile(ENV_PATH, "utf8");
  const env = {};
  for (const line of envRaw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = parseEnvValue(trimmed.slice(eqIndex + 1));
    env[key] = value;
  }
  return env;
}

function nullIfBlank(value) {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;
  if (str.toLowerCase() === "null" || str.toLowerCase() === "undefined") return null;
  return str;
}

function normalizeUuid(value) {
  const input = nullIfBlank(value);
  if (!input) return null;
  const compact = input.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(compact)) {
    throw new Error(`Invalid UUID value: ${value}`);
  }
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function toNumberOrNull(value) {
  const raw = nullIfBlank(value);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function parseCsv(filePath) {
  const csvRaw = await fs.readFile(filePath, "utf8");
  const parsed = Papa.parse(csvRaw, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(`CSV parse error in ${path.basename(filePath)} at row ${first.row}: ${first.message}`);
  }
  return parsed.data;
}

// Build a multi-level lookup map from the old Supabase export for win_date and account_name.
// Keys are lowercased; preference order for win_date: most specific match wins.
function buildOldExportLookup(oldRows) {
  // Maps at three specificity levels: exact > acct+rep > acct only
  // Each stores the first non-null win_date found at that level.
  const exact = new Map();   // acct_name+rep_name+opp_name → { win_date, account_name }
  const byRep = new Map();   // acct_name+rep_name          → { win_date, account_name }
  const byAcct = new Map();  // acct_name                   → { win_date, account_name }

  for (const row of oldRows) {
    const acct = nullIfBlank(row.account_name);
    const rep = nullIfBlank(row.rep_name);
    const opp = nullIfBlank(row.opportunity_name);
    const winDate = nullIfBlank(row.win_date);

    if (acct) {
      const acctKey = acct.toLowerCase().trim();
      const repKey = rep ? `${acctKey}||${rep.toLowerCase().trim()}` : null;
      const exactKey = repKey && opp ? `${repKey}||${opp.toLowerCase().trim()}` : null;

      if (exactKey && !exact.has(exactKey)) exact.set(exactKey, { win_date: winDate, account_name: acct });
      if (repKey && !byRep.has(repKey)) byRep.set(repKey, { win_date: winDate, account_name: acct });
      if (!byAcct.has(acctKey)) byAcct.set(acctKey, { win_date: winDate, account_name: acct });
    }
  }

  return (acctName, repName, oppName) => {
    const acct = (acctName ?? "").toLowerCase().trim();
    const rep = (repName ?? "").toLowerCase().trim();
    const opp = (oppName ?? "").toLowerCase().trim();
    if (!acct) return null;

    const exactKey = `${acct}||${rep}||${opp}`;
    if (exact.has(exactKey)) return exact.get(exactKey);

    const repKey = `${acct}||${rep}`;
    if (byRep.has(repKey)) return byRep.get(repKey);

    return byAcct.get(acct) ?? null;
  };
}

async function fetchAllExistingWins(supabase) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("metrics_wins")
      .select("id,win_date")
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function main() {
  const env = await readEnvFile();
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  console.log("Reading new wins CSV...");
  const csvRows = await parseCsv(CSV_PATH);
  console.log(`New CSV rows: ${csvRows.length}`);

  console.log("Reading old Supabase export for win_date + account_name preservation...");
  const oldExportRows = await parseCsv(OLD_EXPORT_PATH);
  console.log(`Old export rows: ${oldExportRows.length}`);
  const lookupOld = buildOldExportLookup(oldExportRows);

  console.log("Fetching current metrics_wins IDs from Supabase...");
  const existingRows = await fetchAllExistingWins(supabase);
  console.log(`Current DB rows: ${existingRows.length}`);

  const existingIds = new Set();
  for (const row of existingRows) {
    const id = normalizeUuid(row.id);
    if (id) existingIds.add(id);
  }

  let matchedByExact = 0;
  let matchedByRep = 0;
  let matchedByAcct = 0;
  let matchedByNone = 0;

  const incomingIds = new Set();
  const rowById = new Map();
  for (const row of csvRows) {
    const id = normalizeUuid(row.id);
    if (!id) throw new Error("Row missing id");
    incomingIds.add(id);

    const acctName = nullIfBlank(row.account_name);
    const repName = nullIfBlank(row.rep_name);
    const oppName = nullIfBlank(row.opportunity_name);

    const oldMatch = lookupOld(acctName, repName, oppName);

    let preservedWinDate;
    let preservedAccountName;

    if (oldMatch) {
      preservedWinDate = oldMatch.win_date;
      preservedAccountName = oldMatch.account_name ?? acctName;
      // Track match specificity for reporting
      const acctKey = (acctName ?? "").toLowerCase().trim();
      const repKey = `${acctKey}||${(repName ?? "").toLowerCase().trim()}`;
      const exactKey = `${repKey}||${(oppName ?? "").toLowerCase().trim()}`;
      if (oldMatch === lookupOld(acctName, repName, oppName) && exactKey) {
        matchedByExact += 1;
      } else if (repKey) {
        matchedByRep += 1;
      } else {
        matchedByAcct += 1;
      }
    } else {
      preservedWinDate = nullIfBlank(row.win_date);
      preservedAccountName = acctName;
      matchedByNone += 1;
    }

    rowById.set(id, {
      id,
      win_date: preservedWinDate,
      account_name: preservedAccountName,
      salesforce_accountid: nullIfBlank(row.salesforce_accountid),
      rep_name: repName ?? "",
      opportunity_name: oppName,
      opportunity_stage: nullIfBlank(row.opportunity_stage),
      gtmx_team: nullIfBlank(row.gtmx_team),
      account_prospecting_notes: nullIfBlank(row.account_prospecting_notes),
      opportunity_type: nullIfBlank(row.opportunity_type),
      opportunity_software_mrr: toNumberOrNull(row.opportunity_software_mrr),
      line_items: nullIfBlank(row.line_items),
    });
  }
  const upsertRows = Array.from(rowById.values());
  console.log(`Old-export match breakdown: exact/rep/acct/none = ${matchedByExact}/${matchedByRep}/${matchedByAcct}/${matchedByNone}`);

  console.log(`Prepared upsert rows: ${upsertRows.length}`);
  const upsertBatches = chunk(upsertRows, UPSERT_BATCH_SIZE);
  let upsertedCount = 0;
  for (let i = 0; i < upsertBatches.length; i += 1) {
    const batch = upsertBatches[i];
    const { error } = await supabase.from("metrics_wins").upsert(batch, { onConflict: "id" });
    if (error) throw error;
    upsertedCount += batch.length;
    console.log(`Upserted ${upsertedCount}/${upsertRows.length}`);
  }

  const staleIds = Array.from(existingIds).filter((id) => !incomingIds.has(id));
  console.log(`Stale rows to delete: ${staleIds.length}`);

  let deletedCount = 0;
  const staleBatches = chunk(staleIds, DELETE_BATCH_SIZE);
  for (let i = 0; i < staleBatches.length; i += 1) {
    const ids = staleBatches[i];
    const { error } = await supabase.from("metrics_wins").delete().in("id", ids);
    if (error) throw error;
    deletedCount += ids.length;
    console.log(`Deleted ${deletedCount}/${staleIds.length}`);
  }

  const { count, error: countError } = await supabase
    .from("metrics_wins")
    .select("*", { count: "exact", head: true });
  if (countError) throw countError;

  console.log("Done.");
  console.log(JSON.stringify({
    newCsvRows: csvRows.length,
    oldExportRows: oldExportRows.length,
    currentDbRows: existingRows.length,
    dedupedUpsertRows: upsertRows.length,
    matchBreakdown: { exact: matchedByExact, byRep: matchedByRep, byAcct: matchedByAcct, noMatch: matchedByNone },
    deletedRows: staleIds.length,
    finalRowCount: count ?? null,
  }, null, 2));
}

main().catch((err) => {
  console.error("sync-wins failed");
  console.error(err);
  process.exitCode = 1;
});
