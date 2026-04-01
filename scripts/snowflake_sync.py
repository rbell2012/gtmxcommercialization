#!/usr/bin/env python3
"""
Snowflake -> static JSON export + Supabase upserts (win_snapshots, metrics_sales_teams).

This is designed for CI (GitHub Actions) and can also run locally if env vars
are present. It reads SQL from queries/*.sql and writes JSON files to
public/data/*.json.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests
import snowflake.connector
from snowflake.connector import DictCursor


ROOT = Path(__file__).resolve().parents[1]
QUERIES_DIR = ROOT / "queries"
DATA_DIR = ROOT / "public" / "data"

TABLE_QUERY_MAP = {
    "metrics_ops": "metrics_ops.sql",
    "metrics_activity": "metrics_activity.sql",
    "metrics_demos": "metrics_demos.sql",
    "metrics_feedback": "metrics_feedback.sql",
    "metrics_chorus": "metrics_chorus.sql",
    "superhex": "superhex.sql",
    "metrics_tam": "metrics_tam.sql",
}

UPSERT_BATCH_SIZE = 500
DELETE_BATCH_SIZE = 200


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def run_query(conn: snowflake.connector.SnowflakeConnection, sql: str) -> list[dict[str, Any]]:
    with conn.cursor(DictCursor) as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    out: list[dict[str, Any]] = []
    for row in rows:
        out.append({k.lower(): _json_safe(v) for k, v in row.items()})
    return out


def load_sql(path: Path) -> str:
    return path.read_text(encoding="utf-8").strip()


def _json_dumps(rows: list[dict[str, Any]]) -> str:
    return json.dumps(rows, ensure_ascii=True, separators=(",", ":"))


def write_json_atomic(path: Path, rows: list[dict[str, Any]]) -> Path:
    """Write JSON to a unique temp file next to path; caller renames to final on success."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        suffix=".json.tmp",
        prefix=path.stem + ".",
        dir=str(path.parent),
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(_json_dumps(rows))
        return Path(tmp_name)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def promote_temp_json(tmp: Path, final: Path) -> None:
    os.replace(tmp, final)

def _env(name: str) -> str:
    val = os.environ.get(name, "")
    if not val:
        raise RuntimeError(f"Missing required env var: {name}")
    return val


def _supabase_rest_headers(service_key: str) -> dict[str, str]:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }


def _post_upsert_batches(
    url: str,
    headers: dict[str, str],
    payload: list[dict[str, Any]],
    batch_size: int = UPSERT_BATCH_SIZE,
) -> None:
    for i in range(0, len(payload), batch_size):
        chunk = payload[i : i + batch_size]
        resp = requests.post(url, headers=headers, data=json.dumps(chunk), timeout=120)
        if not (200 <= resp.status_code < 300):
            raise RuntimeError(
                f"Upsert batch failed (rows {i}-{i + len(chunk)}): HTTP {resp.status_code} {resp.text[:400]}",
            )


def _fetch_all_ids(
    supabase_url: str,
    service_key: str,
    table: str,
    page_size: int = 1000,
) -> set[str]:
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    ids: set[str] = set()
    offset = 0
    while True:
        url = f"{supabase_url}/rest/v1/{table}?select=id&limit={page_size}&offset={offset}"
        resp = requests.get(url, headers=headers, timeout=120)
        if not (200 <= resp.status_code < 300):
            raise RuntimeError(f"fetch ids {table} offset {offset}: HTTP {resp.status_code} {resp.text[:300]}")
        rows = resp.json()
        if not rows:
            break
        for row in rows:
            if row.get("id") is not None:
                ids.add(str(row["id"]))
        if len(rows) < page_size:
            break
        offset += page_size
    return ids


def _delete_ids_in_batches(
    supabase_url: str,
    service_key: str,
    table: str,
    ids_to_delete: set[str],
    batch_size: int = DELETE_BATCH_SIZE,
) -> None:
    if not ids_to_delete:
        return
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    ids_list = list(ids_to_delete)
    for i in range(0, len(ids_list), batch_size):
        batch = ids_list[i : i + batch_size]
        in_list = ",".join(batch)
        url = f"{supabase_url}/rest/v1/{table}?id=in.({in_list})"
        resp = requests.delete(url, headers=headers, timeout=120)
        if not (200 <= resp.status_code < 300):
            raise RuntimeError(f"delete stale {table}: HTTP {resp.status_code} {resp.text[:300]}")


def _sync_table_with_stale_cleanup(
    supabase_url: str,
    service_key: str,
    table: str,
    payload: list[dict[str, Any]],
) -> None:
    """POST upserts in batches, then delete Supabase rows whose id is not in payload."""
    upsert_headers = _supabase_rest_headers(service_key)
    url = f"{supabase_url}/rest/v1/{table}?on_conflict=id"
    if payload:
        _post_upsert_batches(url, upsert_headers, payload)

    current_ids = {str(r["id"]) for r in payload if r.get("id")}
    db_ids = _fetch_all_ids(supabase_url, service_key, table)
    stale = db_ids - current_ids
    if stale:
        print(f"  removing {len(stale)} stale row(s) from {table}")
        _delete_ids_in_batches(supabase_url, service_key, table, stale)


def upsert_win_snapshots(rows: list[dict[str, Any]]) -> None:
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    supabase_service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not supabase_service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for win_snapshots upsert.")

    payload = [
        {
            "id": str(r.get("id") or ""),
            "account_name": r.get("account_name"),
            "salesforce_accountid": r.get("salesforce_accountid"),
            "win_date": r.get("win_date"),
        }
        for r in rows
        if r.get("id")
    ]
    _sync_table_with_stale_cleanup(supabase_url, supabase_service_key, "win_snapshots", payload)


def upsert_metrics_sales_teams(rows: list[dict[str, Any]]) -> None:
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    supabase_service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not supabase_service_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for metrics_sales_teams upsert.",
        )

    payload = [
        {
            "id": str(r.get("id") or ""),
            "manager_name": r.get("manager_name"),
            "manager_title": r.get("manager_title"),
            "location_reference": r.get("location_reference"),
            "department_name": r.get("department_name"),
            "team_size": r.get("team_size"),
            "avg_monthly_wins": r.get("avg_monthly_wins"),
            "team_members": r.get("team_members"),
        }
        for r in rows
        if r.get("id")
    ]
    _sync_table_with_stale_cleanup(supabase_url, supabase_service_key, "metrics_sales_teams", payload)

def _maybe_load_google_sheets(conn: snowflake.connector.SnowflakeConnection) -> None:
    """
    Optional: load Google Sheets into TOAST.SOURCE_MANUAL.* via toast.procedures.read_google_sheet_to_table.

    This matches gtmx_dashboard.ipynb cells 0, 2, 4, 6.
    If the required env vars are not set, we skip (to allow local runs without Sheets).
    """
    all_reps_sheet = os.environ.get("SHEET_ALL_REPS_IN_TESTS_ID", "").strip()
    madmax_sheet = os.environ.get("SHEET_MAD_MAX_ID", "").strip()
    sterno_sheet = os.environ.get("SHEET_STERNO_ID", "").strip()
    offers_sheet = os.environ.get("SHEET_OFFERS_FEEDBACK_ID", "").strip()
    if not (all_reps_sheet and madmax_sheet and sterno_sheet and offers_sheet):
        print("Sheets pre-step skipped (missing SHEET_* env vars).")
        return

    calls: list[tuple[str, str, str, str, str]] = [
        (all_reps_sheet, "all_reps_in_tests", "toast", "source_manual", "all_reps_in_tests"),
        (madmax_sheet, "UPDATED Boston Customer List", "toast", "source_manual", "from_google_sheet_mad_max"),
        (sterno_sheet, "superhex", "TOAST", "source_manual", "from_google_sheet_sterno"),
        (offers_sheet, "Form Responses 1", "TOAST", "source_manual", "google_sheets_offers_feedback"),
    ]

    with conn.cursor() as cur:
        for sheet_id, tab_name, db, schema, table in calls:
            print(f"loading sheet -> {db}.{schema}.{table} ({tab_name})")
            cur.execute(
                "CALL toast.procedures.read_google_sheet_to_table(%s,%s,%s,%s,%s,FALSE);",
                (sheet_id, tab_name, db, schema, table),
            )

def _fetch_supabase_rows(table: str, select: str, page_size: int = 1000) -> list[dict[str, Any]]:
    """Fetch all rows from Supabase REST (service role)."""
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to fetch Supabase rows.")

    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    out: list[dict[str, Any]] = []
    offset = 0
    while True:
        url = f"{supabase_url}/rest/v1/{table}?select={select}&limit={page_size}&offset={offset}"
        resp = requests.get(url, headers=headers, timeout=120)
        if not (200 <= resp.status_code < 300):
            raise RuntimeError(f"fetch {table} offset {offset}: HTTP {resp.status_code} {resp.text[:300]}")
        rows = resp.json()
        if not rows:
            break
        out.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return out

def _month_bounds_iso(team_start_date: str, month_index: int) -> tuple[str, str]:
    """Return YYYY-MM-DD bounds for the month at index relative to team_start_date."""
    d0 = datetime.fromisoformat(team_start_date + "T00:00:00+00:00")
    y = d0.year
    m = d0.month + month_index
    y += (m - 1) // 12
    m = ((m - 1) % 12) + 1
    start = datetime(y, m, 1, tzinfo=timezone.utc)
    if m == 12:
        end = datetime(y + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(y, m + 1, 1, tzinfo=timezone.utc)
    # Inclusive end date for the month (end is first day of next month).
    last = end - timedelta(days=1)
    return (start.date().isoformat(), last.date().isoformat())

def _create_all_reps_in_tests_temp_table(conn: snowflake.connector.SnowflakeConnection) -> None:
    """
    Build a session temp table ALL_REPS_IN_TESTS_TMP from Supabase pilot assignments.
    This complements/overrides the Google-Sheet ALL_REPS_IN_TESTS path for pilot rep unions.
    """
    with conn.cursor() as cur:
        cur.execute(
            "CREATE OR REPLACE TEMP TABLE ALL_REPS_IN_TESTS_TMP (member_name STRING, team_name STRING, team_start_date DATE, team_end_date DATE);"
        )

    try:
        teams = _fetch_supabase_rows("teams", "id,name,start_date,end_date")
        assignments = _fetch_supabase_rows("project_team_assignments", "id,team_id,sales_team_id,month_index,excluded_members")
        sales_teams = _fetch_supabase_rows("metrics_sales_teams", "id,location_reference,manager_name,team_members")
    except Exception as e:
        print(f"Pilot reps bridge skipped (Supabase fetch failed): {e}")
        return

    team_by_id = {t["id"]: t for t in teams if t.get("id")}
    sales_team_by_id = {st["id"]: st for st in sales_teams if st.get("id")}

    rows_to_insert: list[tuple[str, str, str, str]] = []
    for a in assignments:
        team = team_by_id.get(a.get("team_id"))
        st = sales_team_by_id.get(a.get("sales_team_id"))
        if not team or not st:
            continue
        start_date = team.get("start_date")
        if not isinstance(start_date, str) or not start_date:
            continue
        month_index = a.get("month_index")
        if not isinstance(month_index, int):
            continue
        team_name = f'{st.get("location_reference") or ""} - {st.get("manager_name") or ""}'.strip(" -")

        excluded = {s.strip() for s in str(a.get("excluded_members") or "").split(",") if s.strip()}
        members = [s.strip() for s in str(st.get("team_members") or "").split(",") if s.strip()]
        members = [m for m in members if m not in excluded]
        if not members:
            continue

        # Use month bounds for now; this matches how the UI scopes month_index
        month_start, month_end = _month_bounds_iso(start_date, month_index)
        for m in members:
            rows_to_insert.append((m, team_name, month_start, month_end))

    if not rows_to_insert:
        print("Pilot reps bridge: no rows to insert.")
        return

    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO ALL_REPS_IN_TESTS_TMP (member_name, team_name, team_start_date, team_end_date) VALUES (%s,%s,%s,%s);",
            rows_to_insert,
        )
    print(f"Pilot reps bridge: populated ALL_REPS_IN_TESTS_TMP ({len(rows_to_insert)} rows)")


def _write_sync_metadata_atomic(path: Path, metadata: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        suffix=".json.tmp",
        prefix=path.stem + ".",
        dir=str(path.parent),
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(json.dumps(metadata, ensure_ascii=True, separators=(",", ":")))
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise

def main() -> None:
    failures: list[tuple[str, str]] = []
    pending_temps: list[tuple[Path, Path]] = []
    row_counts: dict[str, int] = {}

    conn = snowflake.connector.connect(
        account=_env("SNOWFLAKE_ACCOUNT"),
        user=_env("SNOWFLAKE_USER"),
        password=_env("SNOWFLAKE_PASSWORD"),
        warehouse=_env("SNOWFLAKE_WAREHOUSE"),
        database=_env("SNOWFLAKE_DATABASE"),
        schema=os.environ.get("SNOWFLAKE_SCHEMA", "PUBLIC"),
        role=os.environ.get("SNOWFLAKE_ROLE"),
    )
    try:
        _maybe_load_google_sheets(conn)
        _create_all_reps_in_tests_temp_table(conn)

        for table, sql_file in TABLE_QUERY_MAP.items():
            try:
                sql = load_sql(QUERIES_DIR / sql_file)
                rows = run_query(conn, sql)
                row_counts[table] = len(rows)
                final_path = DATA_DIR / f"{table}.json"
                tmp_path = write_json_atomic(final_path, rows)
                pending_temps.append((tmp_path, final_path))
                print(f"queued {table}.json ({len(rows)} rows)")
            except Exception as e:
                failures.append((table, f"{type(e).__name__}: {e}"))
                print(f"ERROR {table}: {e}", file=sys.stderr)

        if not failures:
            for tmp_path, final_path in pending_temps:
                promote_temp_json(tmp_path, final_path)
                print(f"wrote {final_path.name}")
        else:
            for tmp_path, _ in pending_temps:
                try:
                    tmp_path.unlink(missing_ok=True)
                except OSError:
                    pass
            print("Skipped promoting JSON files due to earlier errors.", file=sys.stderr)

        try:
            win_snapshots_sql = load_sql(QUERIES_DIR / "win_snapshots.sql")
            win_snapshot_rows = run_query(conn, win_snapshots_sql)
            row_counts["win_snapshots"] = len(win_snapshot_rows)
            upsert_win_snapshots(win_snapshot_rows)
            print(f"upserted win_snapshots ({len(win_snapshot_rows)} source rows)")
        except Exception as e:
            failures.append(("win_snapshots_upsert", f"{type(e).__name__}: {e}"))
            print(f"ERROR win_snapshots upsert: {e}", file=sys.stderr)

        try:
            sales_teams_sql = load_sql(QUERIES_DIR / "metrics_sales_teams.sql")
            sales_teams_rows = run_query(conn, sales_teams_sql)
            row_counts["metrics_sales_teams"] = len(sales_teams_rows)
            upsert_metrics_sales_teams(sales_teams_rows)
            print(f"upserted metrics_sales_teams ({len(sales_teams_rows)} source rows)")
        except Exception as e:
            failures.append(("metrics_sales_teams_upsert", f"{type(e).__name__}: {e}"))
            print(f"ERROR metrics_sales_teams upsert: {e}", file=sys.stderr)

    finally:
        conn.close()

    if failures:
        print("Failures:", failures, file=sys.stderr)
        sys.exit(1)

    sync_metadata = {
        "last_synced_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "row_counts": row_counts,
    }
    _write_sync_metadata_atomic(DATA_DIR / "sync_metadata.json", sync_metadata)
    print("wrote sync_metadata.json")


if __name__ == "__main__":
    main()
