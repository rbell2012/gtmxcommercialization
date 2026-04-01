# Snowflake Cutover Cleanup Checklist

Use this checklist after Snowflake static exports are live and validated in production.

## Pre-cutover validation

1. Run the Snowflake sync workflow manually (`workflow_dispatch`) and confirm seven JSON files under `public/data/` (see [snowflake-static-contract.md](./snowflake-static-contract.md)).
2. Compare row counts and sample rows against current Supabase metrics tables.
3. Deploy a **preview** with `VITE_USE_STATIC_METRICS=true` and verify the dashboard and Data page.

## Cutover sequence

1. Confirm the scheduled GitHub Action is succeeding and committing data when it changes.
2. Set `VITE_USE_STATIC_METRICS=true` in Netlify (production or preview first).
3. Redeploy the site so the bundle picks up the env var.
4. Smoke-test main flows; then disable Hex (or Hex → Supabase) scheduled runs.
5. After a stable period, execute the removal steps below.

## Rollback

1. Set `VITE_USE_STATIC_METRICS=false` in Netlify and redeploy — the app reads metrics from Supabase again.
2. Re-enable Hex / legacy sync if needed. Pipeline-fed tables are **not** dropped until you complete cleanup below.

## Local development

- Default `VITE_USE_STATIC_METRICS=false` uses Supabase (no local JSON required).
- To develop against static files, copy `public/data/*.json` from `main` after a sync commit or from the deployed site.

Google Sheets dependencies that can block a pure Snowflake cutover are summarized in [snowflake-google-sheets-blockers.md](./snowflake-google-sheets-blockers.md).

## Remove legacy sync pipelines

- Remove `docs/hex-supabase-sync.py`.
- Remove `docs/google-apps-script-supabase-sync.gs`.
- Remove any schedules/invocations that execute Hex or Apps Script syncs.

## Remove Supabase metrics sync mechanics

- Drop `cleanup_stale_rows` RPC when no longer referenced.
- Remove related cleanup migrations from active operational docs.
- Remove metrics-table `updated_at` trigger dependencies that were only required for stale-row cleanup.

## Remove obsolete metrics tables in Supabase

After confirming no runtime dependencies:

- Drop `metrics_wins` (replaced by `metrics_ops` + `win_snapshots`).
- Drop remaining pipeline-fed metrics tables that are now static-file backed.

Retained in Supabase:

- `win_snapshots` (lightweight `id/account_name/salesforce_accountid/win_date` lookup).
- User-editable product tables (`teams`, `members`, histories, settings/config tables, exclusions, assignments, findings, etc).

## Frontend cleanup

- Remove unused `fetchAllRpcRows` helpers and any dead code from metrics-RPC fallback paths.
- Remove Hex-only env vars and code paths (including `VITE_HEX_EMBED_URL_API` and related UI surfaces).
- Confirm realtime subscriptions are limited to tables still used at runtime.

## Ops and verification

- Confirm GitHub Actions schedule is healthy and commits only when data changes.
- Confirm Netlify serves fresh `public/data/*.json` files after each sync.
- Verify wins attribution:
  - wins still derived by `isWinStage()`
  - win month uses `win_snapshots.win_date`
  - win display name resolves from `account_name` on `metrics_ops` (fallbacks still work)
