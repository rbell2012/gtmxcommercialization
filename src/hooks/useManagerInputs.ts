import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { dbMutate } from "@/lib/supabase-helpers";
import type { DbTestPhase, DbCustomRole } from "@/lib/database.types";

export interface TestPhase {
  id: string;
  month: string;
  label: string;
  progress: number;
}

const INITIAL_PHASES: TestPhase[] = [
  { id: "m1", month: "Month 1", label: "Get the pilot to work, get product feedback", progress: 0 },
  { id: "m2", month: "Month 2", label: "Win, win, win", progress: 0 },
  { id: "m3", month: "Month 3", label: "Keep winning, build recommendation", progress: 0 },
];

export function useManagerInputs() {
  const [phases, setPhases] = useState<TestPhase[]>(INITIAL_PHASES);
  const [customRoles, setCustomRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // ── load from Supabase ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [pRes, rolesRes] = await Promise.all([
        supabase.from("test_phases").select("*").order("sort_order"),
        supabase.from("custom_roles").select("*").order("created_at"),
      ]);
      if (cancelled) return;

      if (pRes.data && pRes.data.length > 0) {
        setPhases(
          (pRes.data as DbTestPhase[]).map((p) => ({
            id: p.id,
            month: p.month,
            label: p.label,
            progress: p.progress,
          }))
        );
      }

      if (rolesRes.data) {
        setCustomRoles((rolesRes.data as DbCustomRole[]).map((r) => r.name));
      }

      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── phases persistence ──
  const updatePhases = useCallback((updater: (prev: TestPhase[]) => TestPhase[]) => {
    setPhases((prev) => {
      const next = updater(prev);
      for (const p of next) {
        const old = prev.find((o) => o.id === p.id);
        if (!old) continue;
        if (old.label !== p.label || old.progress !== p.progress || old.month !== p.month) {
          dbMutate(
            supabase
              .from("test_phases")
              .update({ month: p.month, label: p.label, progress: p.progress })
              .eq("id", p.id),
            "update test phase",
          );
        }
      }
      return next;
    });
  }, []);

  const addPhase = useCallback((month: string, label: string) => {
    const id = crypto.randomUUID();
    const phase: TestPhase = { id, month, label: label || "TBD", progress: 0 };
    setPhases((prev) => {
      const sortOrder = prev.length;
      dbMutate(
        supabase
          .from("test_phases")
          .insert({ id, month, label: phase.label, progress: 0, sort_order: sortOrder }),
        "add test phase",
      );
      return [...prev, phase];
    });
  }, []);

  // ── custom roles persistence ──
  const addCustomRole = useCallback((name: string) => {
    setCustomRoles((prev) => [...prev, name]);
    dbMutate(supabase.from("custom_roles").insert({ name }), "add custom role");
  }, []);

  return {
    phases,
    updatePhases,
    addPhase,
    customRoles,
    addCustomRole,
    loading,
  };
}
