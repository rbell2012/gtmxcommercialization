import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { DbTeam, DbMember, DbWeeklyFunnel, DbWinEntry, DbSuperhex } from "@/lib/database.types";

// ── Goal metrics system ──

export const GOAL_METRICS = ['accounts', 'contacts_added', 'calls', 'ops', 'demos', 'wins', 'feedback'] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const GOAL_METRIC_LABELS: Record<GoalMetric, string> = {
  accounts: 'Accounts',
  contacts_added: 'Contacts Added',
  calls: 'Calls',
  ops: 'Ops',
  demos: 'Demos',
  wins: 'Wins',
  feedback: 'Feedback',
};

export type MemberGoals = Record<GoalMetric, number>;

export interface AcceleratorRule {
  enabled: boolean;
  conditionOperator: '>' | '<' | 'between';
  conditionValue1: number;
  conditionValue2?: number;
  actionOperator: '+' | '-' | '*';
  actionValue: number;
  actionUnit: '%' | '#';
}

export type AcceleratorConfig = Partial<Record<GoalMetric, AcceleratorRule[]>>;

export const MEMBER_LEVELS = ['adr', 'bdr', 'rep', 'senior', 'principal', 'lead'] as const;
export type MemberLevel = (typeof MEMBER_LEVELS)[number];

export const MEMBER_LEVEL_LABELS: Record<MemberLevel, string> = {
  adr: 'ADR',
  bdr: 'BDR',
  rep: 'Rep',
  senior: 'Senior',
  principal: 'Principal',
  lead: 'Lead',
};

export type TeamGoalsByLevel = Record<GoalMetric, Partial<Record<MemberLevel, number>>>;

export const DEFAULT_TEAM_GOALS_BY_LEVEL: TeamGoalsByLevel = {
  accounts: {},
  contacts_added: {},
  calls: {},
  ops: {},
  demos: {},
  wins: {},
  feedback: {},
};

export const DEFAULT_GOALS: MemberGoals = {
  accounts: 0,
  contacts_added: 0,
  calls: 0,
  ops: 0,
  demos: 0,
  wins: 30,
  feedback: 0,
};

// ── App types ──

export interface WinEntry {
  id: string;
  restaurant: string;
  story?: string;
  date: string;
}

export type WeeklyRole = string;

export interface FunnelData {
  tam: number;
  accounts: number;
  contacts_added: number;
  calls: number;
  connects: number;
  ops: number;
  demos: number;
  wins: number;
  feedback: number;
}

export interface WeeklyFunnel extends FunnelData {
  role?: WeeklyRole;
  submitted?: boolean;
  submittedAt?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  level: MemberLevel | null;
  goals: MemberGoals;
  wins: WinEntry[];
  ducksEarned: number;
  funnelByWeek: Record<string, WeeklyFunnel>;
  isActive: boolean;
}

export type EnabledGoals = Record<GoalMetric, boolean>;

export const DEFAULT_ENABLED_GOALS: EnabledGoals = {
  accounts: false,
  contacts_added: false,
  calls: false,
  ops: false,
  demos: false,
  wins: false,
  feedback: false,
};

export interface Team {
  id: string;
  name: string;
  owner: string;
  leadRep: string;
  sortOrder: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  totalTam: number;
  tamSubmitted: boolean;
  goalsParity: boolean;
  teamGoals: MemberGoals;
  enabledGoals: EnabledGoals;
  acceleratorConfig: AcceleratorConfig;
  teamGoalsByLevel: TeamGoalsByLevel;
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
      accounts: f.accounts ?? 0,
      contacts_added: f.contacts_added ?? 0,
      calls: f.calls,
      connects: f.connects,
      ops: f.ops ?? 0,
      demos: f.demos,
      wins: f.wins,
      feedback: f.feedback ?? 0,
      role: f.role ?? undefined,
      submitted: f.submitted,
      submittedAt: f.submitted_at ?? undefined,
    };
  }
  return {
    id: row.id,
    name: row.name,
    level: (row.level as MemberLevel) ?? null,
    goals: {
      accounts: row.goal_accounts ?? 0,
      contacts_added: row.goal_contacts_added ?? 0,
      calls: row.goal_calls ?? 0,
      ops: row.goal_ops ?? 0,
      demos: row.goal_demos ?? 0,
      wins: row.goal_wins ?? row.goal ?? 30,
      feedback: row.goal_feedback ?? 0,
    },
    ducksEarned: row.ducks_earned,
    isActive: row.is_active,
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
      totalTam: t.total_tam ?? 0,
      tamSubmitted: t.tam_submitted ?? false,
      goalsParity: t.goals_parity ?? false,
      teamGoals: {
        accounts: t.team_goal_accounts ?? 0,
        contacts_added: t.team_goal_contacts_added ?? 0,
        calls: t.team_goal_calls ?? 0,
        ops: t.team_goal_ops ?? 0,
        demos: t.team_goal_demos ?? 0,
        wins: t.team_goal_wins ?? 0,
        feedback: t.team_goal_feedback ?? 0,
      },
      enabledGoals: {
        accounts: t.goal_enabled_accounts ?? false,
        contacts_added: t.goal_enabled_contacts_added ?? false,
        calls: t.goal_enabled_calls ?? false,
        ops: t.goal_enabled_ops ?? false,
        demos: t.goal_enabled_demos ?? false,
        wins: t.goal_enabled_wins ?? false,
        feedback: t.goal_enabled_feedback ?? false,
      },
      acceleratorConfig: (t.accelerator_config as AcceleratorConfig) ?? {},
      teamGoalsByLevel: (t.team_goals_by_level as TeamGoalsByLevel) ?? { ...DEFAULT_TEAM_GOALS_BY_LEVEL },
      members: dbMembers.filter((m) => m.team_id === t.id).map(toAppMember),
    }));

  const unassigned = dbMembers.filter((m) => m.team_id === null && m.is_active).map(toAppMember);

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
  createMember: (name: string, goals?: Partial<MemberGoals>) => TeamMember;
  updateMember: (memberId: string, updates: { name?: string; goals?: Partial<MemberGoals>; level?: MemberLevel | null }) => void;
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

function memberGoalsToDbInsert(goals: MemberGoals) {
  return {
    goal: goals.wins,
    goal_accounts: goals.accounts,
    goal_contacts_added: goals.contacts_added,
    goal_calls: goals.calls,
    goal_ops: goals.ops,
    goal_demos: goals.demos,
    goal_wins: goals.wins,
    goal_feedback: goals.feedback,
  };
}

export function TeamsProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [unassignedMembers, setUnassignedMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // ── initial load ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [tRes, mRes, fRes, wRes, sRes] = await Promise.all([
        supabase.from("teams").select("*").is("archived_at", null),
        supabase.from("members").select("*"),
        supabase.from("weekly_funnels").select("*"),
        supabase.from("win_entries").select("*"),
        supabase.from("superhex").select("*"),
      ]);
      if (cancelled) return;

      const dbMembers = (mRes.data ?? []) as DbMember[];
      const dbFunnels = (fRes.data ?? []) as DbWeeklyFunnel[];
      const superhexRows = (sRes.data ?? []) as DbSuperhex[];

      // Build name -> member_id lookup (case-insensitive, trimmed)
      const memberIdByName = new Map<string, string>();
      for (const m of dbMembers) {
        memberIdByName.set(m.name.toLowerCase().trim(), m.id);
      }

      // Merge superhex data into funnels
      const funnelKey = (memberId: string, weekKey: string) =>
        `${memberId}::${weekKey}`;
      const funnelIndex = new Map<string, number>();
      for (let i = 0; i < dbFunnels.length; i++) {
        funnelIndex.set(funnelKey(dbFunnels[i].member_id, dbFunnels[i].week_key), i);
      }

      for (const row of superhexRows) {
        const memberId = memberIdByName.get(row.rep_name.toLowerCase().trim());
        if (!memberId) {
          console.warn(`[superhex] No member match for rep_name="${row.rep_name}"`);
          continue;
        }
        const weekKey = row.activity_week;
        const key = funnelKey(memberId, weekKey);
        const existingIdx = funnelIndex.get(key);

        if (existingIdx !== undefined) {
          // Existing manual row — superhex is baseline, non-zero manual values win
          const f = dbFunnels[existingIdx];
          f.calls = f.calls > 0 ? f.calls : row.calls_count;
          f.connects = f.connects > 0 ? f.connects : row.connects_count;
          f.demos = f.demos > 0 ? f.demos : row.total_demos;
          f.wins = f.wins > 0 ? f.wins : row.total_wins;
        } else {
          // No manual row — create synthetic funnel from superhex
          const synthetic: DbWeeklyFunnel = {
            id: `superhex-${row.id}`,
            member_id: memberId,
            week_key: weekKey,
            role: null,
            tam: 0,
            accounts: 0,
            contacts_added: 0,
            calls: row.calls_count,
            connects: row.connects_count,
            ops: 0,
            demos: row.total_demos,
            wins: row.total_wins,
            feedback: 0,
            submitted: false,
            submitted_at: null,
          };
          dbFunnels.push(synthetic);
        }
      }

      const { teams: t, unassigned: u } = assembleTeams(
        (tRes.data ?? []) as DbTeam[],
        dbMembers,
        dbFunnels,
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
            old.endDate !== updated.endDate ||
            old.totalTam !== updated.totalTam ||
            old.tamSubmitted !== updated.tamSubmitted ||
            old.goalsParity !== updated.goalsParity ||
            JSON.stringify(old.teamGoals) !== JSON.stringify(updated.teamGoals) ||
            JSON.stringify(old.enabledGoals) !== JSON.stringify(updated.enabledGoals) ||
            JSON.stringify(old.acceleratorConfig) !== JSON.stringify(updated.acceleratorConfig) ||
            JSON.stringify(old.teamGoalsByLevel) !== JSON.stringify(updated.teamGoalsByLevel))
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
              total_tam: updated.totalTam,
              tam_submitted: updated.tamSubmitted,
              goals_parity: updated.goalsParity,
              team_goal_accounts: updated.teamGoals.accounts,
              team_goal_contacts_added: updated.teamGoals.contacts_added,
              team_goal_calls: updated.teamGoals.calls,
              team_goal_ops: updated.teamGoals.ops,
              team_goal_demos: updated.teamGoals.demos,
              team_goal_wins: updated.teamGoals.wins,
              team_goal_feedback: updated.teamGoals.feedback,
              goal_enabled_accounts: updated.enabledGoals.accounts,
              goal_enabled_contacts_added: updated.enabledGoals.contacts_added,
              goal_enabled_calls: updated.enabledGoals.calls,
              goal_enabled_ops: updated.enabledGoals.ops,
              goal_enabled_demos: updated.enabledGoals.demos,
              goal_enabled_wins: updated.enabledGoals.wins,
              goal_enabled_feedback: updated.enabledGoals.feedback,
              accelerator_config: updated.acceleratorConfig,
              team_goals_by_level: updated.teamGoalsByLevel,
            })
            .eq("id", teamId)
            .then();
        }
        if (old) {
          for (const member of updated.members) {
            const oldMember = old.members.find((m) => m.id === member.id);
            if (oldMember) {
              const goalUpdates: Record<string, number> = {};
              for (const metric of GOAL_METRICS) {
                if (oldMember.goals[metric] !== member.goals[metric]) {
                  goalUpdates[`goal_${metric}`] = member.goals[metric];
                }
              }
              if (Object.keys(goalUpdates).length > 0) {
                goalUpdates.goal = member.goals.wins;
                supabase.from("members").update(goalUpdates).eq("id", member.id).then();
              }
              if (oldMember.ducksEarned !== member.ducksEarned) {
                supabase.from("members").update({ ducks_earned: member.ducksEarned }).eq("id", member.id).then();
              }
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
          startDate, endDate, totalTam: 0, tamSubmitted: false,
          goalsParity: false, teamGoals: { ...DEFAULT_GOALS },
          enabledGoals: { ...DEFAULT_ENABLED_GOALS },
          acceleratorConfig: {},
          teamGoalsByLevel: { ...DEFAULT_TEAM_GOALS_BY_LEVEL },
          members: [],
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
      if (team) {
        const activeMembers = team.members.filter((m) => m.isActive);
        if (activeMembers.length > 0) {
          setUnassignedMembers((um) => [...um, ...activeMembers]);
        }
        for (const m of team.members) {
          supabase.from("members").update({ team_id: null }).eq("id", m.id).then();
        }
      }
      return prev.filter((t) => t.id !== teamId);
    });
    supabase.from("teams").update({ archived_at: new Date().toISOString() }).eq("id", teamId).then();
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

  const createMember = useCallback((name: string, goals?: Partial<MemberGoals>): TeamMember => {
    const id = crypto.randomUUID();
    const memberGoals: MemberGoals = { ...DEFAULT_GOALS, ...goals };
    const member: TeamMember = { id, name, level: null, goals: memberGoals, wins: [], ducksEarned: 0, funnelByWeek: {}, isActive: true };
    setUnassignedMembers((prev) => [...prev, member]);
    supabase
      .from("members")
      .insert({ id, name, ...memberGoalsToDbInsert(memberGoals), team_id: null, ducks_earned: 0, is_active: true })
      .then();
    return member;
  }, []);

  const updateMember = useCallback((memberId: string, updates: { name?: string; goals?: Partial<MemberGoals>; level?: MemberLevel | null }) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.level !== undefined) dbUpdates.level = updates.level;
    if (updates.goals) {
      for (const [metric, value] of Object.entries(updates.goals)) {
        if (value !== undefined) dbUpdates[`goal_${metric}`] = value;
      }
      if (updates.goals.wins !== undefined) dbUpdates.goal = updates.goals.wins;
    }

    const applyUpdates = (m: TeamMember): TeamMember => ({
      ...m,
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.level !== undefined && { level: updates.level }),
      ...(updates.goals && { goals: { ...m.goals, ...updates.goals } }),
    });

    setUnassignedMembers((prev) =>
      prev.map((m) => (m.id === memberId ? applyUpdates(m) : m))
    );
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        members: t.members.map((m) => (m.id === memberId ? applyUpdates(m) : m)),
      }))
    );

    if (Object.keys(dbUpdates).length > 0) {
      supabase.from("members").update(dbUpdates).eq("id", memberId).then();
    }
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
        member = t.members.find((m) => m.id === memberId && m.isActive);
        return !!member;
      })?.id;
      if (!member || sourceTeamId === targetTeamId) return prev;

      supabase.from("members").update({ is_active: false }).eq("id", memberId).then();

      const newId = crypto.randomUUID();
      supabase
        .from("members")
        .insert({ id: newId, name: member.name, level: member.level, ...memberGoalsToDbInsert(member.goals), team_id: targetTeamId, ducks_earned: 0, is_active: true })
        .then();

      const freshMember: TeamMember = {
        id: newId,
        name: member.name,
        level: member.level,
        goals: { ...member.goals },
        wins: [],
        ducksEarned: 0,
        funnelByWeek: {},
        isActive: true,
      };

      return prev.map((t) => {
        if (t.id === sourceTeamId)
          return { ...t, members: t.members.map((m) => m.id === memberId ? { ...m, isActive: false } : m) };
        if (t.id === targetTeamId)
          return { ...t, members: [...t.members, freshMember] };
        return t;
      });
    });
  }, [unassignedMembers]);

  const unassignMember = useCallback((memberId: string, fromTeamId: string) => {
    setTeams((prev) => {
      const team = prev.find((t) => t.id === fromTeamId);
      const member = team?.members.find((m) => m.id === memberId && m.isActive);
      if (!member) return prev;

      supabase.from("members").update({ is_active: false }).eq("id", memberId).then();

      const newId = crypto.randomUUID();
      supabase
        .from("members")
        .insert({ id: newId, name: member.name, level: member.level, ...memberGoalsToDbInsert(member.goals), team_id: null, ducks_earned: 0, is_active: true })
        .then();

      const freshMember: TeamMember = {
        id: newId,
        name: member.name,
        level: member.level,
        goals: { ...member.goals },
        wins: [],
        ducksEarned: 0,
        funnelByWeek: {},
        isActive: true,
      };
      setUnassignedMembers((um) => [...um, freshMember]);

      return prev.map((t) =>
        t.id === fromTeamId
          ? { ...t, members: t.members.map((m) => m.id === memberId ? { ...m, isActive: false } : m) }
          : t
      );
    });
  }, []);

  const removeMember = useCallback((memberId: string) => {
    setUnassignedMembers((prev) => prev.filter((m) => m.id !== memberId));
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        members: t.members.map((m) =>
          m.id === memberId ? { ...m, isActive: false } : m
        ),
      }))
    );
    supabase.from("members").update({ is_active: false }).eq("id", memberId).then();
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
        updateMember,
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
