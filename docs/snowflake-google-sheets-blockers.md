# Google Sheets blockers (Snowflake cutover)

Some Hex outputs still depend on Google Sheets or roster data that is not in Snowflake alone. Decide on one approach **before** turning off Hex sync.

## Affected surfaces

| Output | Hex / notebook context | Dependency |
|--------|-------------------------|------------|
| `metrics_feedback` | Cell [42] | Sterno / offers feedback sheets |
| `metrics_tam` | Cell [49] | Mad Max + Sterno sheets; hardcoded rep TAM |
| `win_snapshots` (via wins source) | `mad_max_wins` / cell [41] | May use `google_sheet_mad_max` |
| `metrics_demos` (partial) | Cells [26], [38] | `all_reps_in_tests` from Sheet for pilot-scoped demos; core demos (cell [25]) are Snowflake |

## Resolution options

1. **Supabase as source of truth** — Load sheet data into Postgres tables (manual or admin UI), then point the sync script or frontend at those tables.
2. **CI pre-step** — GitHub Actions job pulls Google Sheets (service account) → JSON or staging table → same pipeline as other metrics.
3. **Roster replacement** — For pilot demos only: join using `teams` / `members` (and date ranges) from Supabase instead of `all_reps_in_tests` in the Snowflake or Python sync layer.

Until blockers are resolved, keep generating `metrics_feedback.json`, `metrics_tam.json`, and full `metrics_demos` via Hex + Supabase, or accept reduced/placeholder static files for those datasets.
