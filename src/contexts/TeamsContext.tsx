import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

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
  members: TeamMember[];
}

export function pilotNameToSlug(name: string): string {
  return name.trim().replace(/\s+/g, "_");
}

const INITIAL_TEAMS: Team[] = [
  {
    id: "mad-max",
    name: "Mad Max",
    owner: "Blake",
    leadRep: "",
    members: [
      { id: "mm-1", name: "Shane", goal: 40, wins: [], ducksEarned: 0, funnelByWeek: {} },
      { id: "mm-2", name: "Zoe", goal: 50, wins: [], ducksEarned: 0, funnelByWeek: {} },
      { id: "mm-3", name: "Carly", goal: 50, wins: [], ducksEarned: 0, funnelByWeek: {} },
    ],
  },
  {
    id: "sterno",
    name: "Sterno",
    owner: "Zach",
    leadRep: "",
    members: [],
  },
  {
    id: "guest-pro",
    name: "Guest Pro",
    owner: "Lo",
    leadRep: "",
    members: [],
  },
];

function loadState<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) return JSON.parse(saved);
  } catch { /* ignore parse errors */ }
  return fallback;
}

interface TeamsContextType {
  teams: Team[];
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
  unassignedMembers: TeamMember[];
  setUnassignedMembers: React.Dispatch<React.SetStateAction<TeamMember[]>>;
  updateTeam: (teamId: string, updater: (team: Team) => Team) => void;
  addTeam: (name: string, owner?: string) => void;
  removeTeam: (teamId: string) => void;
  createMember: (name: string, goal: number) => TeamMember;
  assignMember: (memberId: string, targetTeamId: string) => void;
  unassignMember: (memberId: string, fromTeamId: string) => void;
  removeMember: (memberId: string) => void;
}

const TeamsContext = createContext<TeamsContextType | null>(null);

export function useTeams() {
  const ctx = useContext(TeamsContext);
  if (!ctx) throw new Error("useTeams must be used within TeamsProvider");
  return ctx;
}

export function TeamsProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<Team[]>(() => loadState("gtmx-teams-full", INITIAL_TEAMS));
  const [unassignedMembers, setUnassignedMembers] = useState<TeamMember[]>(() =>
    loadState("gtmx-unassigned-members", [])
  );

  useEffect(() => {
    localStorage.setItem("gtmx-teams-full", JSON.stringify(teams));
  }, [teams]);

  useEffect(() => {
    localStorage.setItem("gtmx-unassigned-members", JSON.stringify(unassignedMembers));
  }, [unassignedMembers]);

  const updateTeam = (teamId: string, updater: (team: Team) => Team) => {
    setTeams((prev) => prev.map((t) => (t.id === teamId ? updater(t) : t)));
  };

  const addTeam = (name: string, owner = "") => {
    const id = name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
    setTeams((prev) => [...prev, { id, name, owner, leadRep: "", members: [] }]);
  };

  const removeTeam = (teamId: string) => {
    setTeams((prev) => {
      const team = prev.find((t) => t.id === teamId);
      if (team && team.members.length > 0) {
        setUnassignedMembers((um) => [...um, ...team.members]);
      }
      return prev.filter((t) => t.id !== teamId);
    });
  };

  const createMember = (name: string, goal: number): TeamMember => {
    const member: TeamMember = {
      id: Date.now().toString(),
      name,
      goal,
      wins: [],
      ducksEarned: 0,
      funnelByWeek: {},
    };
    setUnassignedMembers((prev) => [...prev, member]);
    return member;
  };

  const assignMember = (memberId: string, targetTeamId: string) => {
    const fromUnassigned = unassignedMembers.find((m) => m.id === memberId);
    if (fromUnassigned) {
      setUnassignedMembers((prev) => prev.filter((m) => m.id !== memberId));
      setTeams((prev) =>
        prev.map((t) =>
          t.id === targetTeamId ? { ...t, members: [...t.members, fromUnassigned] } : t
        )
      );
      return;
    }

    setTeams((prev) => {
      let member: TeamMember | undefined;
      const sourceTeamId = prev.find((t) => {
        member = t.members.find((m) => m.id === memberId);
        return !!member;
      })?.id;
      if (!member || sourceTeamId === targetTeamId) return prev;
      return prev.map((t) => {
        if (t.id === sourceTeamId) return { ...t, members: t.members.filter((m) => m.id !== memberId) };
        if (t.id === targetTeamId) return { ...t, members: [...t.members, member!] };
        return t;
      });
    });
  };

  const unassignMember = (memberId: string, fromTeamId: string) => {
    setTeams((prev) => {
      const team = prev.find((t) => t.id === fromTeamId);
      const member = team?.members.find((m) => m.id === memberId);
      if (!member) return prev;
      setUnassignedMembers((um) => [...um, member]);
      return prev.map((t) =>
        t.id === fromTeamId ? { ...t, members: t.members.filter((m) => m.id !== memberId) } : t
      );
    });
  };

  const removeMember = (memberId: string) => {
    setUnassignedMembers((prev) => prev.filter((m) => m.id !== memberId));
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        members: t.members.filter((m) => m.id !== memberId),
      }))
    );
  };

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
        createMember,
        assignMember,
        unassignMember,
        removeMember,
      }}
    >
      {children}
    </TeamsContext.Provider>
  );
}
