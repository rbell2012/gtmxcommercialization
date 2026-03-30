# -*- coding: utf-8 -*-
"""
Hex → Supabase: REST API upsert + stale-row cleanup.

Paste this as a single Python cell AFTER all SQL cells whose outputs are listed
in SYNC_TABLES below. The cell must run in a context where each dataframe name
(e.g. `main`, `all_wins`) exists as a variable (Hex reuses prior cell outputs).

Setup (one-time in Hex)
-----------------------
No special secrets configuration required — the anon key is embedded below
(it is the public key already in the frontend bundle). Optionally override via
Hex Secrets → env var named SUPABASE_ANON_KEY.

No additional dependencies needed — `requests` and `pandas` are already
available in Hex.

Behavior
--------
- Per-table error isolation: one table failing does not stop the others.
- Upsert: POST /rest/v1/{table}?on_conflict=id with merge-duplicates.
  Batched at UPSERT_BATCH_SIZE rows per request; retried on 500/503.
- Cleanup strategy:
    Most tables → timestamp-based: DELETE WHERE updated_at < sync_cutoff.
      All upserted rows get updated_at = now() via trigger; stale rows retain
      their old timestamp and are deleted. Single fast filter, no large payload.
    metrics_sales_teams → RPC (cleanup_stale_rows): needs FK guard to skip
      rows still referenced by project_team_assignments.sales_team_id.
- sync_cutoff = sync_start - 60s to handle server/client clock skew.
- NaN / NaT / NA → null; whole-number floats (63.0) → int (63).
"""

from __future__ import annotations

import datetime
import json
import math
import os
import re
import time
import traceback
import uuid
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SUPABASE_URL = "https://fgshslmhxkdmowisrhon.supabase.co"

# The anon key is safe to embed — it is the public "anon" key enforced by RLS,
# identical to VITE_SUPABASE_ANON_KEY already shipped in the frontend bundle.
# Override by setting env var SUPABASE_ANON_KEY (e.g. via Hex Secrets → env).
_ANON_KEY_FALLBACK = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnc2hzbG1oeGtkbW93aXNyaG9uIiwic"
    "m9sZSI6ImFub24iLCJpYXQiOjE3NzE5MDAwNjAsImV4cCI6MjA4NzQ3NjA2MH0"
    ".6Eljc5Yvf-S8LvOyMoouWX8EWsQPxltQwwkCPgpV_IU"
)

# Rows per POST to /rest/v1/{table}.
# metrics_wins / metrics_ops: lower batch size because of per-row triggers.
UPSERT_BATCH_SIZE = 500
UPSERT_BATCH_SIZE_LARGE = 2000

# HTTP retry config for transient 500/503 responses (upsert only).
MAX_RETRIES = 3
RETRY_BASE_DELAY_S = 2.0

# Clock-skew buffer: subtract this many seconds from sync_start to compute
# the cleanup cutoff, so freshly upserted rows are never accidentally deleted
# even if the Supabase server clock lags slightly behind Hex compute.
CLEANUP_CLOCK_SKEW_S = 60

# Tables that use RPC-based cleanup (needs FK guard).
# All others use the faster timestamp-based cleanup.
_RPC_CLEANUP_TABLES = {"metrics_sales_teams"}

# Hex dataframe variable name → (Supabase table, upsert_batch_size)
SYNC_TABLES: Tuple[Tuple[str, str, int], ...] = (
    ("main",                     "superhex",             UPSERT_BATCH_SIZE_LARGE),
    ("sales_teams",              "metrics_sales_teams",  UPSERT_BATCH_SIZE_LARGE),
    ("all_gtmx_tam",             "metrics_tam",          UPSERT_BATCH_SIZE_LARGE),
    ("all_gtmx_activity",        "metrics_activity",     UPSERT_BATCH_SIZE_LARGE),
    ("all_gtmx_calls",           "metrics_calls",        UPSERT_BATCH_SIZE_LARGE),
    ("all_gtmx_chorus",          "metrics_chorus",       UPSERT_BATCH_SIZE_LARGE),
    ("demos_from_all_test_reps", "metrics_demos",        UPSERT_BATCH_SIZE_LARGE),
    ("all_gtmx_connects",        "metrics_connects",     UPSERT_BATCH_SIZE_LARGE),
    ("all_gtmx_and_pilot_ops",   "metrics_ops",          UPSERT_BATCH_SIZE),
    ("all_wins",                 "metrics_wins",         UPSERT_BATCH_SIZE),
    ("all_gtmx_feedback",        "metrics_feedback",     UPSERT_BATCH_SIZE_LARGE),
)

_CONFLICT_KEY = "id"
_ID_RE = re.compile(r"^[a-z_][a-z0-9_]*$")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def _get_anon_key() -> str:
    key = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    # Reject if env var was accidentally set to the literal secret name string
    if key and key != "SUPABASE_ANON_KEY":
        return key
    return _ANON_KEY_FALLBACK


def _headers(key: str) -> Dict[str, str]:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }


# ---------------------------------------------------------------------------
# Data preparation
# ---------------------------------------------------------------------------

def _cell_to_json(v: Any) -> Any:
    """Convert a DataFrame cell to a JSON-safe Python scalar.

    Whole-number floats (e.g. 63.0) are returned as int (63) so that Postgres
    integer columns accept them — PostgREST rejects JSON 63.0 for integer cols.
    """
    if v is None:
        return None
    if isinstance(v, uuid.UUID):
        return str(v)
    # pd.Timestamp must be checked before datetime.datetime (it is a subclass)
    if isinstance(v, pd.Timestamp):
        return v.isoformat() if pd.notna(v) else None
    # datetime.datetime before datetime.date (datetime is a subclass of date)
    if isinstance(v, datetime.datetime):
        return v.isoformat()
    if isinstance(v, datetime.date):
        return v.isoformat()  # "YYYY-MM-DD"
    try:
        if pd.isna(v):
            return None
    except (ValueError, TypeError):
        pass
    # numpy scalar → python native
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return int(f) if f == int(f) else f
    if isinstance(v, np.bool_):
        return bool(v)
    # Python native float — coerce whole numbers to int
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            return None
        return int(v) if v == int(v) else v
    return v


def _prepare_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Normalise columns, deduplicate on id, coerce cells to JSON-safe values."""
    out = df.copy()
    out.columns = [str(c).strip().lower() for c in out.columns]

    if _CONFLICT_KEY not in out.columns:
        raise ValueError(f"DataFrame must contain column {_CONFLICT_KEY!r}")

    out = out.drop_duplicates(subset=[_CONFLICT_KEY], keep="last")
    out = out[out[_CONFLICT_KEY].notna()].copy()

    records = []
    for _, row in out.iterrows():
        rec: Dict[str, Any] = {}
        for col in out.columns:
            rec[col] = _cell_to_json(row[col])
        records.append(rec)
    return records


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _post_with_retry(
    url: str,
    headers: Dict[str, str],
    payload: Any,
    max_retries: int = MAX_RETRIES,
    base_delay: float = RETRY_BASE_DELAY_S,
    timeout: int = 120,
) -> requests.Response:
    """POST with exponential backoff on 500/503."""
    delay = base_delay
    for attempt in range(max_retries + 1):
        resp = requests.post(url, headers=headers, data=json.dumps(payload), timeout=timeout)
        if resp.status_code not in (500, 503) or attempt == max_retries:
            return resp
        print(f"  HTTP {resp.status_code} — retry {attempt + 1}/{max_retries} in {delay:.0f}s...")
        time.sleep(delay)
        delay *= 2
    return resp  # unreachable; satisfies type checkers


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------

def upsert_table(
    records: List[Dict[str, Any]],
    table_name: str,
    key: str,
    batch_size: int,
) -> Tuple[int, List[str]]:
    """Upsert all records in batches. Returns (total_sent, errors)."""
    url = f"{SUPABASE_URL}/rest/v1/{table_name}?on_conflict={_CONFLICT_KEY}"
    hdrs = _headers(key)
    errors: List[str] = []
    total_sent = 0

    for i in range(0, len(records), batch_size):
        chunk = records[i : i + batch_size]
        resp = _post_with_retry(url, hdrs, chunk)

        if 200 <= resp.status_code < 300:
            total_sent += len(chunk)
        else:
            errors.append(
                f"Upsert rows {i + 1}–{i + len(chunk)}: "
                f"HTTP {resp.status_code} {resp.text[:300]}"
            )

    return total_sent, errors


# ---------------------------------------------------------------------------
# Cleanup — timestamp strategy (default for all large tables)
# ---------------------------------------------------------------------------

def cleanup_by_timestamp(
    table_name: str,
    sync_cutoff: datetime.datetime,
    key: str,
) -> Tuple[int, Optional[str]]:
    """
    Delete stale rows using a single timestamp filter.

    Every row upserted in this sync gets updated_at = now() via trigger.
    Any row with updated_at < sync_cutoff was NOT touched in this sync
    and is therefore stale.

    sync_cutoff = sync_start - CLEANUP_CLOCK_SKEW_S seconds, to protect
    against server/client clock skew.

    Returns (deleted_count, error_or_None).
    """
    cutoff_iso = sync_cutoff.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
    url = f"{SUPABASE_URL}/rest/v1/{table_name}?updated_at=lt.{cutoff_iso}"
    hdrs = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    try:
        resp = requests.delete(url, headers=hdrs, timeout=60)
    except requests.exceptions.Timeout:
        return 0, "Cleanup timeout (60s) — will retry next sync"

    if 200 <= resp.status_code < 300:
        try:
            deleted = len(resp.json())
        except Exception:
            deleted = -1
        return deleted, None
    else:
        return 0, f"Cleanup HTTP {resp.status_code}: {resp.text[:300]}"


# ---------------------------------------------------------------------------
# Cleanup — RPC strategy (metrics_sales_teams only, needs FK guard)
# ---------------------------------------------------------------------------

def cleanup_by_rpc(
    table_name: str,
    valid_ids: List[str],
    key: str,
) -> Tuple[int, Optional[str]]:
    """
    Call cleanup_stale_rows RPC — used only for metrics_sales_teams which
    requires a FK guard (skip rows referenced by project_team_assignments).
    Returns (deleted_count, error_or_None).
    """
    url = f"{SUPABASE_URL}/rest/v1/rpc/cleanup_stale_rows"
    hdrs = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    resp = _post_with_retry(
        url,
        hdrs,
        {"p_table_name": table_name, "p_valid_ids": valid_ids},
        max_retries=1,
        timeout=60,
    )

    if 200 <= resp.status_code < 300:
        try:
            deleted = int(resp.json())
        except Exception:
            deleted = -1
        return deleted, None
    else:
        return 0, f"Cleanup HTTP {resp.status_code}: {resp.text[:300]}"


# ---------------------------------------------------------------------------
# Per-table sync
# ---------------------------------------------------------------------------

def sync_one_table(
    df: pd.DataFrame,
    pg_table: str,
    batch_size: int,
    key: str,
    sync_cutoff: datetime.datetime,
) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "table": pg_table,
        "upserted": 0,
        "deleted": 0,
        "errors": [],
    }

    try:
        records = _prepare_records(df)
    except Exception as e:
        result["errors"].append(f"Prepare: {e}\n{traceback.format_exc()}")
        return result

    if not records:
        result["errors"].append("skipped: no valid rows after prepare")
        return result

    # Upsert
    try:
        sent, upsert_errors = upsert_table(records, pg_table, key, batch_size)
        result["upserted"] = sent
        result["errors"].extend(upsert_errors)
    except Exception as e:
        result["errors"].append(f"Upsert exception: {e}\n{traceback.format_exc()}")

    # Cleanup — only run if upsert had no errors (partial upsert + cleanup
    # would delete rows that didn't make it into the current batch)
    if result["errors"]:
        return result

    try:
        if pg_table in _RPC_CLEANUP_TABLES:
            valid_ids = [str(r[_CONFLICT_KEY]) for r in records if r.get(_CONFLICT_KEY)]
            deleted, err = cleanup_by_rpc(pg_table, valid_ids, key)
        else:
            deleted, err = cleanup_by_timestamp(pg_table, sync_cutoff, key)

        result["deleted"] = deleted
        if err:
            result["errors"].append(err)
    except Exception as e:
        result["errors"].append(f"Cleanup exception: {e}\n{traceback.format_exc()}")

    return result


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_hex_supabase_sync(globals_dict: dict | None = None) -> List[Dict[str, Any]]:
    """
    Sync every entry in SYNC_TABLES.

    globals_dict: namespace containing the Hex dataframe variables.
    Defaults to the calling frame's globals() — correct when this file is
    pasted as the last Python cell in a Hex notebook.
    """
    import inspect

    if globals_dict is None:
        frame = inspect.currentframe()
        if frame is None or frame.f_back is None:
            raise RuntimeError("Cannot resolve globals; pass globals_dict explicitly.")
        globals_dict = frame.f_back.f_globals

    key = _get_anon_key()

    # Record sync start before any upserts. All rows upserted in this run will
    # get updated_at = server_now() via trigger. The cutoff is sync_start minus
    # a clock-skew buffer so freshly upserted rows are never accidentally deleted.
    sync_start = datetime.datetime.utcnow()
    sync_cutoff = sync_start - datetime.timedelta(seconds=CLEANUP_CLOCK_SKEW_S)

    results: List[Dict[str, Any]] = []

    for hex_df_name, pg_table, batch_size in SYNC_TABLES:
        print(f"Syncing {hex_df_name} → {pg_table} ...", end=" ", flush=True)

        df = globals_dict.get(hex_df_name)
        if df is None:
            r: Dict[str, Any] = {
                "hex_df": hex_df_name,
                "table": pg_table,
                "upserted": 0,
                "deleted": 0,
                "errors": [f"missing_dataframe: {hex_df_name!r} not found in notebook"],
            }
            results.append(r)
            print("SKIPPED (missing dataframe)")
            continue

        if not isinstance(df, pd.DataFrame):
            r = {
                "hex_df": hex_df_name,
                "table": pg_table,
                "upserted": 0,
                "deleted": 0,
                "errors": [f"not_a_dataframe: {hex_df_name!r} is {type(df).__name__}"],
            }
            results.append(r)
            print("SKIPPED (not a DataFrame)")
            continue

        r = sync_one_table(df, pg_table, batch_size, key, sync_cutoff)
        r["hex_df"] = hex_df_name

        if r["errors"]:
            print(f"DONE with errors — {r['upserted']} upserted, {r['deleted']} deleted")
        else:
            print(f"OK — {r['upserted']} upserted, {r['deleted']} deleted")

        results.append(r)

    return results


# ---------------------------------------------------------------------------
# Run (this executes when the cell runs in Hex)
# ---------------------------------------------------------------------------

HEX_SYNC_RESULTS = run_hex_supabase_sync()

ok_count = sum(1 for r in HEX_SYNC_RESULTS if not r.get("errors"))
err_count = sum(1 for r in HEX_SYNC_RESULTS if r.get("errors"))
print(f"\nSync finished: {ok_count} ok, {err_count} with issues.")

if err_count:
    print("\n--- Errors ---")
    for r in HEX_SYNC_RESULTS:
        if r.get("errors"):
            print(f"\n[{r['hex_df']} → {r['table']}]")
            for e in r["errors"]:
                print(" ", e)
