import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { DbTeam, DbMember, DbWeeklyFunnel, DbWinEntry } from "@/lib/database.types";

export interface WinEntry {
  id: string;
  restaurant: string;
  story?: string;
  date: string;
}

export type WeeklyRole = string;

export interface FunnelData {
  tam: number;
  calls: number;
  connects: number;
  demos: number;
  wins: number;
}

export interface WeeklyFunnel extends FunnelData {
  role?: WeeklyRole;
  submitted?: boolean;
  submittedAt?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  goal: number;
  wins: WinEntry[];
  ducksEarned: number;
  funnelByWeek: Record<string, WeeklyFunnel>;
}

export interface Team {
  id: string;
  name: string;
  owner: string;
  leadRep: string;
  sortOrder: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  members: TeamMember[];
}

export function pilotNameToSlug(name: string): string {
  return name.trim().replace(/\s+/g, "_");
}

// ── helpers to convert between DB rows and app shapes ──

function dbMemberToApp(
  row: DbMember,
  funnels: DbWeeklyFunnel[],
  wins: DbWinEntry[]
): TeamMember {
  const funnelByWeek: Record<string, WeeklyFunnel> = {};
  for (const f of funnels) {
    funnelByWeek[f.week_key] = {
      tam: f.tam,
      calls: f.calls,
      connects: f.connects,
      demos: f.demos,
      wins: f.wins,
      role: f.role ?? undefined,
      submitted: f.submitted,
      submittedAt: f.submitted_at ?? undefined,
    };
  }
  return {
    id: row.id,
    name: row.name,
    goal: row.goal,
    ducksEarned: row.ducks_earned,
    wins: wins.map((w) => ({
      id: w.id,
      restaurant: w.restaurant,
      story: w.story ?? undefined,
      date: w.date,
    })),
    funnelByWeek,
  };
}

function assembleTeams(
  dbTeams: DbTeam[],
  dbMembers: DbMember[],
  dbFunnels: DbWeeklyFunnel[],
  dbWins: DbWinEntry[]
): { teams: Team[]; unassigned: TeamMember[] } {
  const funnelsByMember = new Map<string, DbWeeklyFunnel[]>();
  for (const f of dbFunnels) {
    const arr = funnelsByMember.get(f.member_id) ?? [];
    arr.push(f);
    funnelsByMember.set(f.member_id, arr);
  }

  const winsByMember = new Map<string, DbWinEntry[]>();
  for (const w of dbWins) {
    const arr = winsByMember.get(w.member_id) ?? [];
    arr.push(w);
    winsByMember.set(w.member_id, arr);
  }

  const toAppMember = (m: DbMember) =>
    dbMemberToApp(m, funnelsByMember.get(m.id) ?? [], winsByMember.get(m.id) ?? []);

  const teams: Team[] = dbTeams
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => ({
      id: t.id,
      name: t.name,
      owner: t.owner,
      leadRep: t.lead_rep,
      sortOrder: t.sort_order,
      isActive: t.is_active,
      startDate: t.start_date,
      endDate: t.end_date,
      members: dbMembers.filter((m) => m.team_id === t.id).map(toAppMember),
    }));

  const unassigned = dbMembers.filter((m) => m.team_id === null).map(toAppMember);

  return { teams, unassigned };
}

// ── context ──

interface TeamsContextType {
  teams: Team[];
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
  unassignedMembers: TeamMember[];
  setUnassignedMembers: React.Dispatch<React.SetStateAction<TeamMember[]>>;
  updateTeam: (teamId: string, updater: (team: Team) => Team) => void;
  addTeam: (name: string, owner?: string, startDate?: string | null, endDate?: string | null) => void;
  removeTeam: (teamId: string) => void;
  reorderTeams: (orderedIds: string[]) => void;
  toggleTeamActive: (teamId: string, isActive: boolean) => void;
  createMember: (name: string, goal: number) => TeamMember;
  assignMember: (memberId: string, targetTeamId: string) => void;
  unassignMember: (memberId: string, fromTeamId: string) => void;
  removeMember: (memberId: string) => void;
  loading: boolean;
}

const TeamsContext = createContext<TeamsContextType | null>(null);

export function useTeams() {
  const ctx = useContext(TeamsContext);
  if (!ctx) throw new Error("useTeams must be used within TeamsProvider");
  return ctx;
}

export function TeamsProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [unassignedMembers, setUnassignedMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // ── initial load ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [tRes, mRes, fRes, wRes] = await Promise.all([
        supabase.from("teams").select("*"),
        supabase.from("members").select("*"),
        supabase.from("weekly_funnels").select("*"),
        supabase.from("win_entries").select("*"),
      ]);
      if (cancelled) return;
      const { teams: t, unassigned: u } = assembleTeams(
        (tRes.data ?? []) as DbTeam[],
        (mRes.data ?? []) as DbMember[],
        (fRes.data ?? []) as DbWeeklyFunnel[],
        (wRes.data ?? []) as DbWinEntry[]
      );
      setTeams(t);
      setUnassignedMembers(u);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── mutations ──

  const updateTeam = useCallback((teamId: string, updater: (team: Team) => Team) => {
    setTeams((prev) => {
      const next = prev.map((t) => (t.id === teamId ? updater(t) : t));
      const updated = next.find((t) => t.id === teamId);
      if (updated) {
        const old = prev.find((t) => t.id === teamId);
        if (
          old &&
          (old.name !== updated.name ||
            old.owner !== updated.owner ||
            old.leadRep !== updated.leadRep ||
            old.isActive !== updated.isActive ||
            old.startDate !== updated.startDate ||
            old.endDate !== updated.endDate)
        ) {
          supabase
            .from("teams")
            .update({
              name: updated.name,
              owner: updated.owner,
              lead_rep: updated.leadRep,
              is_active: updated.isActive,
              start_date: updated.startDate,
              end_date: updated.endDate,
            })
            .eq("id", teamId)
            .then();
        }
        if (old) {
          for (const member of updated.members) {
            const oldMember = old.members.find((m) => m.id === member.id);
            if (oldMember && oldMember.goal !== member.goal) {
              supabase.from("members").update({ goal: member.goal }).eq("id", member.id).then();
            }
            if (oldMember && oldMember.ducksEarned !== member.ducksEarned) {
              supabase.from("members").update({ ducks_earned: member.ducksEarned }).eq("id", member.id).then();
            }
          }
        }
      }
      return next;
    });
  }, []);

  const addTeam = useCallback(
    (name: string, owner = "", startDate: string | null = null, endDate: string | null = null) => {
      const tempId = crypto.randomUUID();
      setTeams((prev) => {
        const nextOrder = prev.length > 0 ? Math.max(...prev.map((t) => t.sortOrder)) + 1 : 0;
        const newTeam: Team = {
          id: tempId, name, owner, leadRep: "",
          sortOrder: nextOrder, isActive: true,
          startDate, endDate, members: [],
        };
        supabase
          .from("teams")
          .insert({ id: tempId, name, owner, sort_order: nextOrder, is_active: true, start_date: startDate, end_date: endDate })
          .then();
        return [...prev, newTeam];
      });
    },
    []
  );

  const removeTeam = useCallback((teamId: string) => {
    setTeams((prev) => {
      const team = prev.find((t) => t.id === teamId);
      if (team && team.members.length > 0) {
        setUnassignedMembers((um) => [...um, ...team.members]);
        for (const m of team.members) {
          supabase.from("members").update({ team_id: null }).eq("id", m.id).then();
        }
      }
      return prev.filter((t) => t.id !== teamId);
    });
    supabase.from("teams").delete().eq("id", teamId).then();
  }, []);

  const reorderTeams = useCallback((orderedIds: string[]) => {
    setTeams((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]));
      const reordered = orderedIds
        .map((id, i) => {
          const t = byId.get(id);
          return t ? { ...t, sortOrder: i } : null;
        })
        .filter(Boolean) as Team[];
      for (const t of reordered) {
        supabase.from("teams").update({ sort_order: t.sortOrder }).eq("id", t.id).then();
      }
      return reordered;
    });
  }, []);

  const toggleTeamActive = useCallback((teamId: string, isActive: boolean) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, isActive } : t))
    );
    supabase.from("teams").update({ is_active: isActive }).eq("id", teamId).then();
  }, []);

  const createMember = useCallback((name: string, goal: number): TeamMember => {
    const id = crypto.randomUUID();
    const member: TeamMember = { id, name, goal, wins: [], ducksEarned: 0, funnelByWeek: {} };
    setUnassignedMembers((prev) => [...prev, member]);
    supabase
      .from("members")
      .insert({ id, name, goal, team_id: null, ducks_earned: 0 })
      .then();
    return member;
  }, []);

  const assignMember = useCallback((memberId: string, targetTeamId: string) => {
    const fromUnassigned = unassignedMembers.find((m) => m.id === memberId);
    if (fromUnassigned) {
      setUnassignedMembers((prev) => prev.filter((m) => m.id !== memberId));
      setTeams((prev) =>
        prev.map((t) =>
          t.id === targetTeamId ? { ...t, members: [...t.members, fromUnassigned] } : t
        )
      );
      supabase.from("members").update({ team_id: targetTeamId }).eq("id", memberId).then();
      return;
    }

    setTeams((prev) => {
      let member: TeamMember | undefined;
      const sourceTeamId = prev.find((t) => {
        member = t.members.find((m) => m.id === memberId);
        return !!member;
      })?.id;
      if (!member || sourceTeamId === targetTeamId) return prev;
      supabase.from("members").update({ team_id: targetTeamId }).eq("id", memberId).then();
      return prev.map((t) => {
        if (t.id === sourceTeamId) return { ...t, members: t.members.filter((m) => m.id !== memberId) };
        if (t.id === targetTeamId) return { ...t, members: [...t.members, member!] };
        return t;
      });
    });
  }, [unassignedMembers]);

  const unassignMember = useCallback((memberId: string, fromTeamId: string) => {
    setTeams((prev) => {
      const team = prev.find((t) => t.id === fromTeamId);
      const member = team?.members.find((m) => m.id === memberId);
      if (!member) return prev;
      setUnassignedMembers((um) => [...um, member]);
      supabase.from("members").update({ team_id: null }).eq("id", memberId).then();
      return prev.map((t) =>
        t.id === fromTeamId ? { ...t, members: t.members.filter((m) => m.id !== memberId) } : t
      );
    });
  }, []);

  const removeMember = useCallback((memberId: string) => {
    setUnassignedMembers((prev) => prev.filter((m) => m.id !== memberId));
    setTeams((prev) =>
      prev.map((t) => ({ ...t, members: t.members.filter((m) => m.id !== memberId) }))
    );
    supabase.from("members").delete().eq("id", memberId).then();
  }, []);

  return (
    <TeamsContext.Provider
      value={{
        teams,
        setTeams,
        unassignedMembers,
        setUnassignedMembers,
        updateTeam,
        addTeam,
        removeTeam,
        reorderTeams,
        toggleTeamActive,
        createMember,
        assignMember,
        unassignMember,
        removeMember,
        loading,
      }}
    >
      {children}
    </TeamsContext.Provider>
  );
}
