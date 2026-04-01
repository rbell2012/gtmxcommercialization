import { supabase } from "@/lib/supabase";

/** Filter rows where `column` is one of `values` (rep_name, etc.). */
export type MetricsRowFilter = { column: string; values: string[] };

/** Inclusive date range on a row field (ISO date strings). */
export type MetricsDateRangeFilter = { column: string; start: string; end: string };

export interface MetricsDataSource {
  fetchTable(
    table: string,
    columns: string,
    pageSize?: number,
    filter?: MetricsRowFilter,
    dateRange?: MetricsDateRangeFilter,
  ): Promise<Record<string, unknown>[]>;
}

function rowInDateRange(row: Record<string, unknown>, col: string, start: string, end: string): boolean {
  const v = row[col];
  if (v == null || typeof v !== "string") return false;
  return v >= start && v <= end;
}

export class SupabaseMetricsSource implements MetricsDataSource {
  async fetchTable(
    table: string,
    columns: string,
    pageSize = 1000,
    filter?: MetricsRowFilter,
    dateRange?: MetricsDateRangeFilter,
  ): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = [];
    let from = 0;
    while (true) {
      let query = supabase.from(table).select(columns).order("id", { ascending: true }).range(from, from + pageSize - 1);
      if (filter && filter.values.length > 0) {
        query = query.in(filter.column, filter.values);
      }
      if (dateRange) {
        query = query.gte(dateRange.column, dateRange.start).lte(dateRange.column, dateRange.end);
      }
      const { data, error } = await query;
      if (error) {
        console.warn(`[SupabaseMetricsSource] ${table} page offset ${from}:`, error.message);
        break;
      }
      if (!data || data.length === 0) break;
      all.push(...(data as Record<string, unknown>[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }
}

export class StaticFileMetricsSource implements MetricsDataSource {
  async fetchTable(
    table: string,
    _columns: string,
    _pageSize = 1000,
    filter?: MetricsRowFilter,
    dateRange?: MetricsDateRangeFilter,
  ): Promise<Record<string, unknown>[]> {
    const resp = await fetch(`/data/${table}.json`);
    if (!resp.ok) {
      throw new Error(`Failed to load static metrics for ${table}: HTTP ${resp.status}`);
    }
    const payload = await resp.json();
    if (!Array.isArray(payload)) return [];
    let rows = payload as Record<string, unknown>[];
    if (filter && filter.values.length > 0) {
      const allowed = new Set(filter.values);
      rows = rows.filter((row) => {
        const v = row[filter.column];
        return typeof v === "string" && allowed.has(v);
      });
    }
    if (dateRange) {
      rows = rows.filter((row) => rowInDateRange(row, dateRange.column, dateRange.start, dateRange.end));
    }
    return rows;
  }
}

/** Same source the dashboard uses (`VITE_USE_STATIC_METRICS`). */
export function getMetricsDataSource(): MetricsDataSource {
  return import.meta.env.VITE_USE_STATIC_METRICS === "true"
    ? new StaticFileMetricsSource()
    : new SupabaseMetricsSource();
}
