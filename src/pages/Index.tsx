import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Trophy, Plus, Users, TrendingUp, TrendingDown, MessageCircle, Calendar, Handshake, Video, Activity } from "lucide-react";
import { useTeams, type Team, type TeamMember, type WinEntry, type FunnelData, type WeeklyFunnel, type WeeklyRole, type GoalMetric, type MemberGoals, GOAL_METRICS, GOAL_METRIC_LABELS, DEFAULT_GOALS, pilotNameToSlug } from "@/contexts/TeamsContext";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useChartColors } from "@/hooks/useChartColors";
import { useManagerInputs } from "@/hooks/useManagerInputs";
import { supabase } from "@/lib/supabase";
import type { DbTeamPhaseLabel } from "@/lib/database.types";
import { getMemberMetricTotal, getEffectiveGoal } from "@/lib/quota-helpers";

const DEFAULT_ROLES = ["TOFU", "Closing", "No Funnel Activity"];

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

interface ComputedPhase {
  monthIndex: number;
  monthLabel: string;
  progress: number;
  label: string;
}

function generateTestPhases(
  startDate: string | null,
  endDate: string | null,
  labels: Record<number, string>
): ComputedPhase[] {
  if (!startDate || !endDate) return [];

  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const phases: ComputedPhase[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonthStart = new Date(end.getFullYear(), end.getMonth(), 1);

  let index = 0;
  while (cursor <= endMonthStart) {
    const monthName = cursor.toLocaleString("en-US", { month: "long" });
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const monthEnd = new Date(year, month + 1, 0);
    const monthStart = new Date(year, month, 1);

    let progress = 0;
    if (today > monthEnd) {
      progress = 100;
    } else if (today >= monthStart) {
      const totalDays = monthEnd.getDate();
      const dayOfMonth = today.getDate();
      progress = Math.round((dayOfMonth / totalDays) * 100);
    }

    phases.push({
      monthIndex: index,
      monthLabel: `(${index + 1}) ${monthName}`,
      progress,
      label: labels[index] ?? "",
    });

    cursor.setMonth(cursor.getMonth() + 1);
    index++;
  }

  return phases;
}

function computeOverallProgress(startDate: string | null, endDate: string | null): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate + "T00:00:00").getTime();
  const end = new Date(endDate + "T00:00:00").getTime();
  const today = new Date().setHours(0, 0, 0, 0);
  if (today <= start) return 0;
  if (today >= end) return 100;
  return Math.round(((today - start) / (end - start)) * 100);
}

function formatDateRange(startDate: string | null, endDate: string | null): string | null {
  if (!startDate) return null;
  const fmt = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    const mon = d.toLocaleString("en-US", { month: "short" });
    const yr = String(d.getFullYear()).slice(2);
    return `${mon} '${yr}`;
  };
  const start = fmt(startDate);
  const end = endDate ? fmt(endDate) : null;
  return end ? `${start} – ${end}` : start;
}

const emptyFunnel: WeeklyFunnel = { tam: 0, calls: 0, connects: 0, ops: 0, demos: 0, wins: 0, feedback: 0, activity: 0 };

function getWeekKeys(count = 8): { key: string; label: string }[] {
  const weeks: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
    const label = `${mon.getMonth() + 1}/${mon.getDate()}`;
    weeks.push({ key, label });
  }
  return weeks;
}

function getCurrentWeekKey(): string {
  return getWeekKeys(1)[0].key;
}

function getTeamWeekKeys(startDate: string | null, endDate: string | null): { key: string; label: string }[] {
  const toMonday = (d: Date): Date => {
    const m = new Date(d);
    m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    m.setHours(0, 0, 0, 0);
    return m;
  };

  const currentMonday = toMonday(new Date());

  let startMon: Date;
  if (startDate) {
    startMon = toMonday(new Date(startDate + "T00:00:00"));
  } else {
    startMon = new Date(currentMonday);
    startMon.setDate(startMon.getDate() - 7 * 7);
  }

  let endMon = new Date(currentMonday);
  if (endDate) {
    const edMon = toMonday(new Date(endDate + "T00:00:00"));
    if (edMon < currentMonday) {
      endMon = edMon;
    }
  }

  const weeks: { key: string; label: string }[] = [];
  const cursor = new Date(startMon);
  while (cursor <= endMon) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const label = `${cursor.getMonth() + 1}/${cursor.getDate()}`;
    weeks.push({ key, label });
    cursor.setDate(cursor.getDate() + 7);
  }

  return weeks;
}

function getMemberFunnel(m: TeamMember, weekKey: string): WeeklyFunnel {
  return m.funnelByWeek?.[weekKey] ?? { ...emptyFunnel };
}

function getCarriedTam(member: TeamMember, weekKey: string, orderedWeekKeys: string[]): number {
  const idx = orderedWeekKeys.indexOf(weekKey);
  if (idx === -1) return getMemberFunnel(member, weekKey).tam;
  for (let i = idx; i >= 0; i--) {
    const tam = getMemberFunnel(member, orderedWeekKeys[i]).tam;
    if (tam > 0) return tam;
  }
  return 0;
}

function getMemberTotalWins(m: TeamMember): number {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-`;
  return Object.entries(m.funnelByWeek || {}).reduce(
    (s, [weekKey, f]) => (weekKey.startsWith(prefix) ? s + f.wins : s),
    0
  );
}



function getTeamMonthKeys(teamWeeks: { key: string; label: string }[]): { key: string; label: string; weekKeys: string[]; colSpan: number }[] {
  const monthMap = new Map<string, { key: string; label: string; weekKeys: string[] }>();
  for (const w of teamWeeks) {
    const d = new Date(w.key + "T00:00:00");
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { key: monthKey, label: monthLabel, weekKeys: [] });
    }
    monthMap.get(monthKey)!.weekKeys.push(w.key);
  }
  return Array.from(monthMap.values()).map((m) => ({ ...m, colSpan: m.weekKeys.length }));
}

const Duck = ({ size = 24 }: { size?: number }) => (
  <span style={{ fontSize: size }} role="img" aria-label="duck">
    🦆
  </span>
);

const DuckCelebration = ({ memberName, onDone }: { memberName: string; onDone: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="animate-bounce text-center pointer-events-none">
        <div className="text-6xl mb-2">🦆</div>
        <p className="font-display text-2xl font-bold text-primary drop-shadow-lg">
          Great ducking job, {memberName}!
        </p>
        <div className="flex justify-center gap-2 mt-3">
          {[...Array(5)].map((_, i) => (
            <span
              key={i}
              className="text-3xl animate-pulse"
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              🦆
            </span>
          ))}
        </div>
      </div>
      {[...Array(12)].map((_, i) => (
        <span
          key={`float-${i}`}
          className="absolute text-2xl pointer-events-none"
          style={{
            left: `${Math.random() * 90 + 5}%`,
            top: `${Math.random() * 90 + 5}%`,
            animation: `floatDuck ${1.5 + Math.random() * 2}s ease-in-out ${Math.random() * 0.5}s forwards`,
            opacity: 0,
          }}
        >
          🦆
        </span>
      ))}
    </div>
  );
};

const METRIC_BAR_COLORS: string[] = [
  "progress-bar-orange",
  "progress-bar-blue",
  "progress-bar-orange",
  "progress-bar-blue",
  "progress-bar-orange",
  "progress-bar-blue",
];

const Index = () => {
  const { pilotId } = useParams<{ pilotId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const { teams: allTeams, updateTeam } = useTeams();
  const teams = allTeams.filter((t) => t.isActive);
  const {
    missionPurpose,
    updateMission,
    missionSubmitted,
    updateMissionSubmitted,
    customRoles,
    addCustomRole,
  } = useManagerInputs();
  const [editingField, setEditingField] = useState<string | null>(null);

  const resolvedTeam = pilotId
    ? teams.find((t) => pilotNameToSlug(t.name) === pilotId) ?? teams[0]
    : teams[0];
  const activeTab = resolvedTeam?.id ?? "";
  const [selectedMember, setSelectedMember] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [storyText, setStoryText] = useState("");
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [detailMember, setDetailMember] = useState<TeamMember | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  const [phaseLabels, setPhaseLabels] = useState<Record<string, Record<number, string>>>({});

  useEffect(() => {
    if (pilotId && !teams.find((t) => pilotNameToSlug(t.name) === pilotId)) {
      navigate("/Pilots", { replace: true });
    }
  }, [pilotId, teams, navigate]);

  useEffect(() => {
    if (location.hash) {
      requestAnimationFrame(() => {
        const el = document.getElementById(location.hash.slice(1));
        el?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, [location.hash, activeTab]);

  const { toast } = useToast();

  const allRoles = [...DEFAULT_ROLES, ...customRoles];

  const activeTeam = teams.find((t) => t.id === activeTab);

  useEffect(() => {
    if (!activeTeam?.id) return;
    if (phaseLabels[activeTeam.id]) return;
    supabase
      .from("team_phase_labels")
      .select("*")
      .eq("team_id", activeTeam.id)
      .then(({ data }) => {
        if (data) {
          const labels: Record<number, string> = {};
          for (const row of data as DbTeamPhaseLabel[]) {
            labels[row.month_index] = row.label;
          }
          setPhaseLabels((prev) => ({ ...prev, [activeTeam.id]: labels }));
        }
      });
  }, [activeTeam?.id]);

  const updatePhaseLabel = useCallback((teamId: string, monthIndex: number, label: string) => {
    setPhaseLabels((prev) => ({
      ...prev,
      [teamId]: { ...(prev[teamId] ?? {}), [monthIndex]: label },
    }));
    supabase
      .from("team_phase_labels")
      .upsert(
        { team_id: teamId, month_index: monthIndex, label },
        { onConflict: "team_id,month_index" }
      )
      .then();
  }, []);

  const teamLabels = phaseLabels[activeTeam?.id ?? ""] ?? {};
  const computedPhases = activeTeam
    ? generateTestPhases(activeTeam.startDate, activeTeam.endDate, teamLabels)
    : [];
  const overallProgress = activeTeam
    ? computeOverallProgress(activeTeam.startDate, activeTeam.endDate)
    : 0;

  const extendTest = () => {
    if (!activeTeam?.endDate) return;
    const newEnd = addMonths(activeTeam.endDate, 1);
    updateTeam(activeTeam.id, (t) => ({ ...t, endDate: newEnd }));
  };

  const addRole = () => {
    if (!newRoleName.trim() || allRoles.includes(newRoleName.trim())) return;
    addCustomRole(newRoleName.trim());
    setNewRoleName("");
    setAddRoleOpen(false);
  };

  const addWin = () => {
    if (!selectedMember || !restaurantName.trim()) return;

    const member = activeTeam?.members.find((m) => m.id === selectedMember);
    if (!member) return;

    const winId = crypto.randomUUID();
    const entry: WinEntry = {
      id: winId,
      restaurant: restaurantName.trim(),
      story: storyText.trim() || undefined,
      date: new Date().toLocaleDateString(),
    };

    supabase
      .from("win_entries")
      .insert({
        id: winId,
        member_id: selectedMember,
        restaurant: entry.restaurant,
        story: entry.story ?? null,
      })
      .then();

    const newWinCount = member.wins.length + 1;
    const prevMilestone = Math.floor(member.wins.length / 3);
    const newMilestone = Math.floor(newWinCount / 3);
    const earnedNewDuck = newMilestone > prevMilestone;

    updateTeam(activeTab, (team) => ({
      ...team,
      members: team.members.map((m) =>
        m.id === selectedMember
          ? {
              ...m,
              wins: [...m.wins, entry],
              ducksEarned: earnedNewDuck ? m.ducksEarned + (newMilestone - prevMilestone) : m.ducksEarned,
            }
          : m
      ),
    }));

    if (earnedNewDuck) {
      setCelebration(member.name);
      toast({
        title: "🦆 Great ducking job!",
        description: `${member.name} just earned duck #${newMilestone}!`,
      });
    }

    setSelectedMember("");
    setRestaurantName("");
    setStoryText("");
  };

  const addMember = () => {
    if (!newName.trim()) return;
    const memberId = crypto.randomUUID();
    const goals: MemberGoals = { ...DEFAULT_GOALS };
    updateTeam(activeTab, (team) => ({
      ...team,
      members: [
        ...team.members,
        { id: memberId, name: newName.trim(), goals, wins: [], ducksEarned: 0, funnelByWeek: {}, isActive: true },
      ],
    }));
    supabase
      .from("members")
      .insert({
        id: memberId, name: newName.trim(),
        goal_calls: goals.calls, goal_ops: goals.ops,
        goal_demos: goals.demos, goal_wins: goals.wins,
        goal_feedback: goals.feedback, goal_activity: goals.activity,
        team_id: activeTab, ducks_earned: 0, is_active: true,
      })
      .then();
    setNewName("");
    setAddMemberOpen(false);
  };

  const handleBarClick = (data: any) => {
    const member = activeTeam?.members.find((m) => m.name === data.name);
    if (member) setDetailMember(member);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8">
      {celebration && (
        <DuckCelebration memberName={celebration} onDone={() => setCelebration(null)} />
      )}
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <Trophy className="h-8 w-8 text-primary" />
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            GTMx <span className="text-gradient-primary">Pilots</span>
          </h1>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(val) => {
          const team = teams.find((t) => t.id === val);
          if (!team) return;
          const isFirst = teams[0].id === team.id;
          navigate(isFirst ? "/Pilots" : `/Pilots/${pilotNameToSlug(team.name)}`);
        }}>
          <TabsList className="mb-6 grid w-full bg-muted p-1 h-auto" style={{ gridTemplateColumns: `repeat(${teams.length}, minmax(0, 1fr))` }}>
            {teams.map((team) => {
              const total = team.members.reduce((s, m) => s + getMemberTotalWins(m), 0);
              return (
                <TabsTrigger
                  key={team.id}
                  value={team.id}
                  className="flex flex-col gap-0.5 py-2 font-display text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <span className="flex items-center gap-1.5 text-base">
                    {team.name}
                    {total > 0 && (
                      <span className="rounded-full bg-background/20 px-2 py-0.5 text-xs">
                        {total}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1 text-xs font-normal opacity-70" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                    <span>Owner:</span>
                    {editingField === `${team.id}-owner` ? (
                      <Input
                        autoFocus
                        value={team.owner}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateTeam(team.id, (t) => ({ ...t, owner: e.target.value }));
                        }}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => e.key === "Enter" && setEditingField(null)}
                        className="h-5 w-20 text-center text-xs bg-transparent border-none shadow-none p-0 focus-visible:ring-1 focus-visible:ring-primary/50"
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:underline min-w-[20px] text-center"
                        onClick={(e) => { e.stopPropagation(); setEditingField(`${team.id}-owner`); }}
                      >
                        {team.owner || "—"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs font-normal opacity-70" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                    <span>Lead rep:</span>
                    {editingField === `${team.id}-leadRep` ? (
                      <Input
                        autoFocus
                        value={team.leadRep}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateTeam(team.id, (t) => ({ ...t, leadRep: e.target.value }));
                        }}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => e.key === "Enter" && setEditingField(null)}
                        className="h-5 w-20 text-center text-xs bg-transparent border-none shadow-none p-0 focus-visible:ring-1 focus-visible:ring-primary/50"
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:underline min-w-[20px] text-center"
                        onClick={(e) => { e.stopPropagation(); setEditingField(`${team.id}-leadRep`); }}
                      >
                        {team.leadRep || "—"}
                      </span>
                    )}
                  </div>
                </TabsTrigger>
              );
            })}
          </TabsList>

        {/* ===== MANAGER INPUTS ===== */}
        <div id="manager-inputs" className="mb-5 rounded-xl bg-secondary px-6 py-4 shadow-lg scroll-mt-16">
          <h2 className="font-display text-2xl font-bold tracking-tight text-primary">
            📋 Manager Inputs
          </h2>
        </div>

        {/* Test Phases */}
        <div className="mb-4 rounded-lg border border-border bg-card p-5 glow-card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-foreground">Test Phases</h3>
            <div className="flex items-center gap-3">
              {activeTeam?.endDate && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-border text-foreground hover:bg-muted text-xs"
                  onClick={extendTest}
                >
                  <Plus className="h-3.5 w-3.5" /> Extend the Test
                </Button>
              )}
              {computedPhases.length > 0 && (
                <span className="text-xs font-semibold text-primary tabular-nums">
                  {overallProgress}% Complete
                </span>
              )}
            </div>
          </div>
          {computedPhases.length > 0 ? (
            <>
              <div className="flex h-6 w-full overflow-hidden rounded-full bg-muted">
                {computedPhases.map((phase, i) => {
                  const colors = ["hsl(24, 80%, 53%)", "hsl(210, 65%, 50%)", "hsl(30, 80%, 50%)", "hsl(160, 50%, 48%)", "hsl(280, 50%, 55%)", "hsl(45, 70%, 52%)"];
                  const widthPct = 100 / computedPhases.length;
                  const fillPct = phase.progress;
                  return (
                    <div key={phase.monthIndex} className="relative h-full" style={{ width: `${widthPct}%` }}>
                      <div
                        className="h-full transition-all duration-500 ease-out"
                        style={{
                          width: `${fillPct}%`,
                          backgroundColor: colors[i % colors.length],
                          borderRadius: i === 0 && fillPct > 0 ? "9999px 0 0 9999px" : i === computedPhases.length - 1 && fillPct >= 100 ? "0 9999px 9999px 0" : "0",
                        }}
                      />
                      {i < computedPhases.length - 1 && <div className="absolute right-0 top-0 h-full w-px bg-border" />}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${computedPhases.length}, minmax(0, 1fr))` }}>
                {computedPhases.map((phase, i) => {
                  const colors = ["text-primary", "text-accent", "text-primary", "text-accent", "text-primary", "text-accent"];
                  return (
                    <div key={phase.monthIndex} className="text-center">
                      <p className={`text-xs font-semibold ${colors[i % colors.length]}`}>{phase.monthLabel}</p>
                      <Input
                        value={phase.label}
                        onChange={(e) => updatePhaseLabel(activeTeam!.id, phase.monthIndex, e.target.value)}
                        placeholder="—"
                        className="h-5 w-full text-[10px] text-center bg-transparent border-none shadow-none p-0 text-muted-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/50"
                      />
                      <p className="text-[10px] text-muted-foreground">{phase.progress}%</p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Set start and end dates in{" "}
              <a href="/settings" className="text-primary underline hover:text-primary/80">Settings</a>
              {" "}to view test phases.
            </p>
          )}
        </div>

        {/* Mission & Purpose */}
        <div className={`mb-4 rounded-lg border bg-card p-5 glow-card ${missionSubmitted ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
          <div className="flex items-center justify-between mb-2">
            <label className="font-display text-lg font-semibold text-foreground">Mission & Purpose of Test</label>
            {missionSubmitted && <span className="text-xs font-medium text-primary">✅ Submitted</span>}
          </div>
          <Textarea
            value={missionPurpose}
            onChange={(e) => updateMission(e.target.value)}
            placeholder="Describe the mission and purpose of this test..."
            className="bg-secondary/20 border-border text-foreground placeholder:text-muted-foreground text-sm"
            rows={3}
            disabled={missionSubmitted}
          />
          <div className="mt-3 flex justify-end">
            {!missionSubmitted ? (
              <Button size="sm" onClick={() => updateMissionSubmitted(true)} className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-8 px-4">
                Submit
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => updateMissionSubmitted(false)} className="text-xs h-7 border-border text-muted-foreground hover:text-foreground">
                Edit
              </Button>
            )}
          </div>
        </div>

        {/* Total TAM — metrics_touched_accounts data if available, else manual input */}
        {activeTeam && (() => {
          const activeMembers = activeTeam.members.filter((m) => m.isActive);
          const hasMetricsTam = activeMembers.some((m) => m.touchedTam > 0);
          if (hasMetricsTam) {
            const teamTam = activeMembers.reduce((s, m) => s + m.touchedTam, 0);
            const teamTouched = activeMembers.reduce((s, m) => s + m.touchedAccounts, 0);
            const membersWithTam = activeMembers.filter((m) => m.touchedTam > 0);
            const avgTam = membersWithTam.length > 0 ? Math.round(teamTam / membersWithTam.length) : 0;
            return (
              <div className="mb-8 rounded-lg border border-primary/30 bg-primary/5 bg-card p-5 glow-card">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3">
                    <label className="font-display text-lg font-semibold text-foreground">Total TAM</label>
                    <span className="font-display text-2xl font-bold text-primary">{teamTam.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-muted-foreground">Touched Accounts</label>
                    <span className="font-display text-2xl font-bold text-foreground">{teamTouched.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-muted-foreground">Avg TAM</label>
                    <span className="font-display text-2xl font-bold text-foreground">{avgTam.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-muted-foreground">Touch Rate</label>
                    <span className="font-display text-2xl font-bold text-primary">{teamTam > 0 ? ((teamTouched / teamTam) * 100).toFixed(0) : 0}%</span>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div className={`mb-8 rounded-lg border bg-card p-5 glow-card ${activeTeam.tamSubmitted ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <label className="font-display text-lg font-semibold text-foreground">Total TAM</label>
                  <Input
                    type="number"
                    min={0}
                    value={activeTeam.totalTam || ""}
                    onChange={(e) => updateTeam(activeTeam.id, (t) => ({ ...t, totalTam: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className="h-9 w-36 bg-secondary/20 border-border text-foreground text-sm"
                    placeholder="0"
                    disabled={activeTeam.tamSubmitted}
                  />
                  {activeTeam.tamSubmitted && <span className="text-xs font-medium text-primary">✅ Submitted</span>}
                </div>
                {!activeTeam.tamSubmitted ? (
                  <Button size="sm" onClick={() => {
                    const members = activeTeam.members.filter((m) => m.isActive);
                    const tamPerMember = members.length > 0 ? Math.round(activeTeam.totalTam / members.length) : 0;
                    const weekKey = getCurrentWeekKey();
                    updateTeam(activeTeam.id, (t) => ({
                      ...t,
                      tamSubmitted: true,
                      members: t.members.map((m) => {
                        if (!m.isActive) return m;
                        const existing = getMemberFunnel(m, weekKey);
                        return {
                          ...m,
                          funnelByWeek: {
                            ...m.funnelByWeek,
                            [weekKey]: { ...existing, tam: tamPerMember },
                          },
                        };
                      }),
                    }));
                    for (const m of members) {
                      const existing = getMemberFunnel(m, weekKey);
                      supabase
                        .from("weekly_funnels")
                        .upsert(
                          {
                            member_id: m.id,
                            week_key: weekKey,
                            tam: tamPerMember,
                            calls: existing.calls,
                            connects: existing.connects,
                            ops: existing.ops,
                            demos: existing.demos,
                            wins: existing.wins,
                            feedback: existing.feedback,
                            activity: existing.activity,
                            role: existing.role ?? null,
                            submitted: existing.submitted ?? false,
                            submitted_at: existing.submittedAt ?? null,
                          },
                          { onConflict: "member_id,week_key" }
                        )
                        .then();
                    }
                  }} className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-8 px-4">
                    Submit
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => updateTeam(activeTeam.id, (t) => ({ ...t, tamSubmitted: false }))} className="text-xs h-7 border-border text-muted-foreground hover:text-foreground">
                    Edit
                  </Button>
                )}
              </div>
            </div>
          );
        })()}

        {/* ===== GOALS ===== */}
        {teams.filter((t) => t.id === activeTab).map((team) => {
          const members = team.members;
          const activeMembers = members.filter((m) => m.isActive);
          const visibleMetrics = GOAL_METRICS.filter((m) => team.enabledGoals[m]);
          return (
            <div key={team.id} className="mb-6 rounded-lg border border-border bg-card p-5 glow-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-foreground">Monthly Goals</h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-border text-foreground hover:bg-muted"
                  onClick={() => {
                    const isFirst = teams[0].id === team.id;
                    navigate(isFirst ? "/Pilots" : `/Pilots/${pilotNameToSlug(team.name)}`);
                    setAddMemberOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Member
                </Button>
              </div>

              {visibleMetrics.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Configure goals in{" "}
                  <a href="/settings" className="text-primary underline hover:text-primary/80">Settings</a>
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                          {visibleMetrics.map((metric) => (
                            <th key={metric} className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[80px]">
                              {GOAL_METRIC_LABELS[metric]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeMembers.map((m) => (
                          <tr key={m.id} className="border-b border-border/30">
                            <td className="py-3 pr-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground whitespace-nowrap">{m.name}</span>
                                {m.ducksEarned > 0 && (
                                  <span className="flex items-center">
                                    {[...Array(m.ducksEarned)].map((_, j) => (
                                      <span key={j} className="text-xs">🦆</span>
                                    ))}
                                  </span>
                                )}
                              </div>
                            </td>
                            {visibleMetrics.map((metric, metricIdx) => {
                              const actual = getMemberMetricTotal(m, metric);
                              const goal = getEffectiveGoal(team, m, metric);
                              const pct = goal > 0 ? (actual / goal) * 100 : 0;
                              const barPct = Math.min(pct, 100);
                              return (
                                <td key={metric} className="py-3 px-2">
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-xs font-semibold text-foreground tabular-nums">
                                      {actual} <span className="text-muted-foreground font-normal">/</span> {goal}
                                    </span>
                                    <div className="h-1.5 w-full max-w-[64px] overflow-hidden rounded-full bg-muted">
                                      <div
                                        className={`h-full rounded-full transition-all duration-500 ease-out ${METRIC_BAR_COLORS[metricIdx % METRIC_BAR_COLORS.length]}`}
                                        style={{ width: `${barPct}%` }}
                                      />
                                    </div>
                                    <span className={`text-[10px] tabular-nums ${pct >= 100 ? "text-green-400 font-semibold" : "text-muted-foreground"}`}>{pct.toFixed(0)}%</span>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Former members */}
                  {members.some((m) => !m.isActive) && (
                    <div className="mt-4 pt-4 border-t border-border/50">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Former Members</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm opacity-50">
                          <tbody>
                            {members.filter((m) => !m.isActive).map((m) => (
                              <tr key={m.id} className="border-b border-border/30">
                                <td className="py-2 pr-3">
                                  <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">{m.name}</span>
                                </td>
                                {visibleMetrics.map((metric, metricIdx) => {
                                  const actual = getMemberMetricTotal(m, metric);
                                  const goal = getEffectiveGoal(team, m, metric);
                                  const pct = goal > 0 ? (actual / goal) * 100 : 0;
                                  const barPct = Math.min(pct, 100);
                                  return (
                                    <td key={metric} className="py-2 px-2">
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-xs text-muted-foreground tabular-nums">{actual} / {goal}</span>
                                        <div className="h-1.5 w-full max-w-[64px] overflow-hidden rounded-full bg-muted">
                                          <div
                                            className={`h-full rounded-full transition-all duration-500 ease-out ${METRIC_BAR_COLORS[metricIdx % METRIC_BAR_COLORS.length]}`}
                                            style={{ width: `${barPct}%` }}
                                          />
                                        </div>
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-foreground">Add to {activeTeam?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-secondary/20 border-border text-foreground placeholder:text-muted-foreground" />
              <Button onClick={addMember} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">Add</Button>
            </div>
          </DialogContent>
        </Dialog>

          {teams.map((team) => (
            <TabsContent key={team.id} value={team.id}>
              <TeamTab
                team={team}
                onAddMemberClick={() => {
                  const isFirst = teams[0].id === team.id;
                  navigate(isFirst ? "/Pilots" : `/Pilots/${pilotNameToSlug(team.name)}`);
                  setAddMemberOpen(true);
                }}
                selectedMember={selectedMember}
                setSelectedMember={setSelectedMember}
                restaurantName={restaurantName}
                setRestaurantName={setRestaurantName}
                storyText={storyText}
                setStoryText={setStoryText}
                addWin={addWin}
                handleBarClick={handleBarClick}
                setDetailMember={setDetailMember}
                updateTeam={updateTeam}
                allRoles={allRoles}
                addRoleOpen={addRoleOpen}
                setAddRoleOpen={setAddRoleOpen}
                newRoleName={newRoleName}
                setNewRoleName={setNewRoleName}
                addRole={addRole}
              />
            </TabsContent>
          ))}
        </Tabs>


        <Dialog open={!!detailMember} onOpenChange={(open) => !open && setDetailMember(null)}>
          <DialogContent className="bg-card border-border max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-foreground">
                {detailMember?.name}'s Wins ({detailMember?.wins.length})
                {detailMember && detailMember.ducksEarned > 0 && (
                  <span className="ml-2">
                    {[...Array(detailMember.ducksEarned)].map((_, i) => (
                      <span key={i}>🦆</span>
                    ))}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            {detailMember && detailMember.wins.length > 0 ? (
              <div className="space-y-2 pt-2">
                {detailMember.wins.map((w) => (
                  <div key={w.id} className="rounded-md bg-secondary/30 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-primary">{w.restaurant}</span>
                      <span className="text-xs text-muted-foreground">{w.date}</span>
                    </div>
                    {w.story && <p className="mt-1 text-sm text-foreground/70">{w.story}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="pt-2 text-sm text-muted-foreground">No wins yet — get out there!</p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

function TeamTab({
  team,
  onAddMemberClick,
  selectedMember,
  setSelectedMember,
  restaurantName,
  setRestaurantName,
  storyText,
  setStoryText,
  addWin,
  handleBarClick,
  setDetailMember,
  updateTeam,
  allRoles,
  addRoleOpen,
  setAddRoleOpen,
  newRoleName,
  setNewRoleName,
  addRole,
}: {
  team: Team;
  onAddMemberClick: () => void;
  selectedMember: string;
  setSelectedMember: (v: string) => void;
  restaurantName: string;
  setRestaurantName: (v: string) => void;
  storyText: string;
  setStoryText: (v: string) => void;
  addWin: () => void;
  handleBarClick: (data: any) => void;
  setDetailMember: (m: TeamMember | null) => void;
  updateTeam: (teamId: string, updater: (team: Team) => Team) => void;
  allRoles: string[];
  addRoleOpen: boolean;
  setAddRoleOpen: (v: boolean) => void;
  newRoleName: string;
  setNewRoleName: (v: string) => void;
  addRole: () => void;
}) {
  const currentWeek = getCurrentWeekKey();
  const members = team.members;
  const activeMembers = members.filter((m) => m.isActive);
  const teamTotal = members.reduce((s, m) => s + getMemberTotalWins(m), 0);
  const teamWeeks = getTeamWeekKeys(team.startDate, team.endDate);

  const weeklyScrollRef = useRef<HTMLDivElement>(null);
  const playerColRef = useRef<HTMLTableCellElement>(null);
  const [playerColW, setPlayerColW] = useState(0);

  useLayoutEffect(() => {
    if (playerColRef.current) {
      setPlayerColW(playerColRef.current.offsetWidth);
    }
  });

  useEffect(() => {
    if (weeklyScrollRef.current) {
      weeklyScrollRef.current.scrollLeft = weeklyScrollRef.current.scrollWidth;
    }
  }, [team.startDate, team.endDate]);

  const recentWeeks = getWeekKeys(2);
  const prevWeekKey = recentWeeks[0].key;
  const currWeekKey = recentWeeks[1].key;
  const currWeekWins = members.reduce((s, m) => s + getMemberFunnel(m, currWeekKey).wins, 0);
  const prevWeekWins = members.reduce((s, m) => s + getMemberFunnel(m, prevWeekKey).wins, 0);
  const winsUp = currWeekWins >= prevWeekWins;
  const teamDucks = members.reduce((s, m) => s + m.ducksEarned, 0);
  const teamTotalOps = activeMembers.reduce((s, m) => s + getMemberMetricTotal(m, 'ops'), 0);
  const teamTotalDemos = activeMembers.reduce((s, m) => s + getMemberMetricTotal(m, 'demos'), 0);
  const teamTotalFeedback = activeMembers.reduce((s, m) => s + getMemberMetricTotal(m, 'feedback'), 0);

  const chartData = members.map((m) => ({
    name: m.name,
    wins: getMemberTotalWins(m),
  }));

  const allStories = members
    .flatMap((m) =>
      m.wins.filter((w) => w.story).map((w) => ({ ...w, memberName: m.name }))
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-8">
      {/* ===== TEST SIGNALS ===== */}
      <div id="test-signals" className="scroll-mt-16">
        <div className="mb-5 rounded-xl bg-secondary px-6 py-4 shadow-lg">
          <h2 className="font-display text-2xl font-bold tracking-tight text-primary">
            📡 Test Signals
          </h2>
        </div>
        <div className="space-y-6">
          {/* Team Total Bar */}
          <div className="relative overflow-hidden rounded-2xl border-2 border-secondary/30 bg-gradient-to-br from-secondary via-secondary/90 to-secondary/80 p-6 shadow-xl">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/15 blur-2xl" />
            <div className="absolute -left-4 -bottom-4 h-24 w-24 rounded-full bg-primary/10 blur-xl" />
            <div className="relative z-10">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-display text-2xl font-bold text-secondary-foreground tracking-tight">
                    {team.name}
                  </h3>
                  <p className="text-sm font-medium text-secondary-foreground/70">Led by {team.owner}</p>
                  {formatDateRange(team.startDate, team.endDate) && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Calendar className="h-3.5 w-3.5 text-secondary-foreground/50" />
                      <span className="text-xs font-medium text-secondary-foreground/50">
                        {formatDateRange(team.startDate, team.endDate)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2 text-right">
                    <Users className="h-5 w-5 text-secondary-foreground/70" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-secondary-foreground/50">Members</p>
                      <p className="font-display text-2xl font-bold text-secondary-foreground">{activeMembers.length}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-4xl font-black text-primary">
                      {teamTotal}
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-secondary-foreground/50">Wins</p>
                  </div>
                </div>
              </div>
              {teamDucks > 0 && (
                <div className="mt-3 flex items-center gap-1">
                  {[...Array(Math.min(teamDucks, 20))].map((_, i) => (
                    <span key={i} className="text-lg hover-scale inline-block">🦆</span>
                  ))}
                </div>
              )}
              {/* Conversion Rates */}
              {(() => {
                const allWeeks = getWeekKeys(8);
                  const totals = {
                    calls: members.reduce((s, m) => allWeeks.reduce((ws, w) => ws + getMemberFunnel(m, w.key).calls, 0) + s, 0),
                    connects: members.reduce((s, m) => allWeeks.reduce((ws, w) => ws + getMemberFunnel(m, w.key).connects, 0) + s, 0),
                    demos: members.reduce((s, m) => allWeeks.reduce((ws, w) => ws + getMemberFunnel(m, w.key).demos, 0) + s, 0),
                    wins: teamTotal,
                  };
                  return (
                    <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                      <div className="rounded-md bg-secondary-foreground/5 py-2">
                        {(() => {
                          const ta = members.reduce((s, m) => s + m.touchedAccounts, 0);
                          const tt = members.reduce((s, m) => s + m.touchedTam, 0);
                          const hasMetrics = tt > 0;
                          if (hasMetrics) {
                            return (
                              <>
                                <p className="font-display text-lg font-bold text-primary">{((ta / tt) * 100).toFixed(0)}%</p>
                                <p className="text-[10px] text-secondary-foreground/50">Touch Rate</p>
                              </>
                            );
                          }
                          return (
                            <>
                              <p className="font-display text-lg font-bold text-primary">{team.totalTam > 0 ? ((totals.calls / team.totalTam) * 100).toFixed(0) : 0}%</p>
                              <p className="text-[10px] text-secondary-foreground/50">TAM→Call</p>
                            </>
                          );
                        })()}
                      </div>
                      <div className="rounded-md bg-secondary-foreground/5 py-2">
                        <p className="font-display text-lg font-bold text-secondary-foreground">{totals.calls > 0 ? ((totals.connects / totals.calls) * 100).toFixed(0) : 0}%</p>
                        <p className="text-[10px] text-secondary-foreground/50">Call→Connect</p>
                      </div>
                      <div className="rounded-md bg-secondary-foreground/5 py-2">
                        <p className="font-display text-lg font-bold text-primary">{totals.connects > 0 ? ((totals.demos / totals.connects) * 100).toFixed(0) : 0}%</p>
                        <p className="text-[10px] text-secondary-foreground/50">Connect→Demo</p>
                      </div>
                      <div className="rounded-md bg-secondary-foreground/5 py-2">
                        <p className="font-display text-lg font-bold text-secondary-foreground">{totals.demos > 0 ? ((totals.wins / totals.demos) * 100).toFixed(0) : 0}%</p>
                        <p className="text-[10px] text-secondary-foreground/50">Demo→Win</p>
                      </div>
                    </div>
                );
              })()}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <StatCard
              icon={<Handshake className="h-5 w-5 text-accent" />}
              label="Ops"
              value={teamTotalOps}
            />
            <StatCard
              icon={<Video className="h-5 w-5 text-primary" />}
              label="Demos"
              value={teamTotalDemos}
            />
            <StatCard
              icon={winsUp
                ? <TrendingUp className="h-5 w-5 text-accent" />
                : <TrendingDown className="h-5 w-5 text-destructive" />}
              label="Wins"
              value={teamTotal}
            />
            <StatCard
              icon={<MessageCircle className="h-5 w-5 text-primary" />}
              label="Feedback"
              value={teamTotalFeedback}
            />
            <StatCard
              icon={<Activity className="h-5 w-5 text-accent" />}
              label="Activity"
              value={teamTotalActivity}
            />
          </div>

          {/* Empty state */}
          {activeMembers.length === 0 && (
            <div className="rounded-lg border border-border border-dashed bg-card/50 p-10 text-center glow-card">
              <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="mb-4 text-muted-foreground">No members yet on {team.name}</p>
              <Button onClick={onAddMemberClick} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="mr-2 h-4 w-4" /> Add First Member
              </Button>
            </div>
          )}

          {/* Week Over Week */}
          <WeekOverWeekView team={team} />
        </div>
      </div>

      {/* ===== PLAYER'S SECTION ===== */}
      <div id="players-section" className="scroll-mt-16">
        <div className="mb-5 rounded-xl bg-secondary px-6 py-4 shadow-lg">
          <h2 className="font-display text-2xl font-bold tracking-tight text-primary">
            🎮 Player's Section
          </h2>
        </div>
        <div className="space-y-6">

          {activeMembers.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5 glow-card">
              <div className="mb-4 flex items-baseline justify-between">
                <h3 className="font-display text-lg font-semibold text-foreground">Your Funnels</h3>
                <span className="text-xs text-muted-foreground italic">Update weekly by Tuesday 12pm EST</span>
              </div>
              <div className="space-y-4">
                {activeMembers.map((m) => {
                  const f = getMemberFunnel(m, currentWeek);
                  const role = (m.funnelByWeek?.[currentWeek] as WeeklyFunnel)?.role;
                  const upsertFunnelField = (updates: Record<string, unknown>) => {
                    const current = getMemberFunnel(m, currentWeek);
                    supabase
                      .from("weekly_funnels")
                      .upsert(
                        {
                          member_id: m.id,
                          week_key: currentWeek,
                          tam: current.tam,
                          calls: current.calls,
                          connects: current.connects,
                          ops: current.ops,
                          demos: current.demos,
                          wins: current.wins,
                          feedback: current.feedback,
                          activity: current.activity,
                          role: current.role ?? null,
                          submitted: current.submitted ?? false,
                          submitted_at: current.submittedAt ?? null,
                          ...updates,
                        },
                        { onConflict: "member_id,week_key" }
                      )
                      .then();
                  };
                  const updateFunnel = (field: keyof FunnelData, value: string) => {
                    const num = Math.max(0, parseInt(value) || 0);
                    updateTeam(team.id, (t) => ({
                      ...t,
                      members: t.members.map((mem) =>
                        mem.id === m.id ? { ...mem, funnelByWeek: { ...mem.funnelByWeek, [currentWeek]: { ...getMemberFunnel(mem, currentWeek), [field]: num } } } : mem
                      ),
                    }));
                    upsertFunnelField({ [field]: num });
                  };
                  const updateRole = (val: string) => {
                    updateTeam(team.id, (t) => ({
                      ...t,
                      members: t.members.map((mem) =>
                        mem.id === m.id ? { ...mem, funnelByWeek: { ...mem.funnelByWeek, [currentWeek]: { ...getMemberFunnel(mem, currentWeek), role: val as WeeklyRole } } } : mem
                      ),
                    }));
                    upsertFunnelField({ role: val });
                  };
                  return (
                    <div key={m.id} className={`rounded-md p-3 ${f.submitted ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/20'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-foreground">{m.name}</p>
                        {f.submitted && (
                          <span className="text-xs font-medium text-primary flex items-center gap-1">
                            ✅ Submitted {f.submittedAt ? `on ${f.submittedAt}` : ''}
                          </span>
                        )}
                      </div>
                      <div className="mb-2 flex items-center gap-2">
                        <Select value={role || ""} onValueChange={updateRole} disabled={f.submitted}>
                          <SelectTrigger className="h-8 w-full sm:w-48 bg-background border-border/50 text-foreground text-xs">
                            <SelectValue placeholder="Select role this week" />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border z-50">
                            {allRoles.map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Dialog open={addRoleOpen} onOpenChange={setAddRoleOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
                              <Plus className="h-3 w-3 mr-1" /> Add Role
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-card border-border">
                            <DialogHeader>
                              <DialogTitle className="font-display text-foreground">Add Custom Role</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3 pt-2">
                              <Input placeholder="Role name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} className="bg-secondary/20 border-border text-foreground placeholder:text-muted-foreground" />
                              <Button onClick={addRole} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">Add</Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Cx Called</label>
                          <Input type="number" min={0} value={f.calls || ""} onChange={(e) => updateFunnel("calls", e.target.value)} disabled={f.submitted} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Connects</label>
                          <Input type="number" min={0} value={f.connects || ""} onChange={(e) => updateFunnel("connects", e.target.value)} disabled={f.submitted} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Ops</label>
                          <Input type="number" min={0} value={f.ops || ""} onChange={(e) => updateFunnel("ops", e.target.value)} disabled={f.submitted} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Demos</label>
                          <Input type="number" min={0} value={f.demos || ""} onChange={(e) => updateFunnel("demos", e.target.value)} disabled={f.submitted} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Wins</label>
                          <Input type="number" min={0} value={f.wins || ""} onChange={(e) => updateFunnel("wins", e.target.value)} disabled={f.submitted} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Feedback</label>
                          <Input type="number" min={0} value={f.feedback || ""} onChange={(e) => updateFunnel("feedback", e.target.value)} disabled={f.submitted} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Activity</label>
                          <Input type="number" min={0} value={f.activity || ""} onChange={(e) => updateFunnel("activity", e.target.value)} disabled={f.submitted} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>Call→Connect: <strong className="text-primary">{f.calls > 0 ? ((f.connects / f.calls) * 100).toFixed(0) : 0}%</strong></span>
                        <span>Connect→Demo: <strong className="text-accent">{f.connects > 0 ? ((f.demos / f.connects) * 100).toFixed(0) : 0}%</strong></span>
                        <span>Demo→Win: <strong className="text-primary">{f.demos > 0 ? ((f.wins / f.demos) * 100).toFixed(0) : 0}%</strong></span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        {!f.submitted ? (
                          <>
                            <p className="text-[10px] text-muted-foreground italic">Any value entered in here will completely overwrite the value given by the report.</p>
                            <Button
                              size="sm"
                              onClick={() => {
                                const now = new Date().toLocaleDateString();
                                updateTeam(team.id, (t) => ({
                                  ...t,
                                  members: t.members.map((mem) =>
                                    mem.id === m.id
                                      ? {
                                          ...mem,
                                          funnelByWeek: {
                                            ...mem.funnelByWeek,
                                            [currentWeek]: {
                                              ...getMemberFunnel(mem, currentWeek),
                                              submitted: true,
                                              submittedAt: now,
                                            },
                                          },
                                        }
                                      : mem
                                  ),
                                }));
                                upsertFunnelField({ submitted: true, submitted_at: new Date().toISOString() });
                              }}
                              className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-8 px-4"
                            >
                              Submit Week
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              updateTeam(team.id, (t) => ({
                                ...t,
                                members: t.members.map((mem) =>
                                  mem.id === m.id
                                    ? {
                                        ...mem,
                                        funnelByWeek: {
                                          ...mem.funnelByWeek,
                                          [currentWeek]: {
                                            ...getMemberFunnel(mem, currentWeek),
                                            submitted: false,
                                            submittedAt: undefined,
                                          },
                                        },
                                      }
                                    : mem
                                ),
                              }));
                              upsertFunnelField({ submitted: false, submitted_at: null });
                            }}
                            className="ml-auto text-xs h-7 border-border text-muted-foreground hover:text-foreground"
                          >
                            Edit Submission
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stories */}
          {allStories.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5 glow-card">
              <div className="mb-4 flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                <h3 className="font-display text-lg font-semibold text-foreground">Win Stories</h3>
                <span className="ml-auto text-xs text-muted-foreground">Weirdest story of the week wins a prize 🏆</span>
              </div>
              <div className="space-y-3">
                {allStories.map((s) => (
                  <div key={s.id} className="rounded-md bg-secondary/20 px-4 py-3">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-primary">{s.memberName}</span>
                        <span className="text-xs text-accent">@ {s.restaurant}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{s.date}</span>
                    </div>
                    <p className="text-sm text-foreground/80">{s.story}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== WEEKLY DATA GRID ===== */}
      {members.length > 0 && (
        <div id="weekly-data" className="scroll-mt-16">
          <div className="mb-5 rounded-xl bg-secondary px-6 py-4 shadow-lg">
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary">
              📊 Weekly Data
            </h2>
          </div>
          <div ref={weeklyScrollRef} className="rounded-lg border border-border bg-card py-5 glow-card overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="border-b border-border">
                  <th ref={playerColRef} className="sticky left-0 z-30 bg-card text-left py-2 pl-5 pr-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Player</th>
                  <th className="sticky z-20 bg-card text-left py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap" style={{ left: playerColW }}>Metric</th>
                  {teamWeeks.map((w) => (
                    <th key={w.key} className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{w.label}</th>
                  ))}
                  <th className="sticky right-0 z-10 bg-card text-center py-2 pl-2 pr-5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const hasMetricsTam = members.some((m) => m.touchedTam > 0);
                  const weeks = teamWeeks;
                  const weekKeyList = weeks.map((wk) => wk.key);
                  return members.map((m, mIdx) => {
                    const allMetricRows: { label: string; key: keyof FunnelData }[] = [
                      { label: "TAM", key: "tam" },
                      { label: "Call", key: "calls" },
                      { label: "Connect", key: "connects" },
                      { label: "Ops", key: "ops" },
                      { label: "Demo", key: "demos" },
                      { label: "Win", key: "wins" },
                      { label: "Feedback", key: "feedback" },
                      { label: "Activity", key: "activity" },
                    ];
                    const alwaysShow = new Set<string>(["tam", "connects"]);
                    const metricRows = allMetricRows.filter(
                      (r) => alwaysShow.has(r.key) || team.enabledGoals[r.key as keyof typeof team.enabledGoals]
                    );
                    const convRates: { label: string; numKey?: keyof FunnelData; denKey?: keyof FunnelData; touchRate?: boolean }[] = hasMetricsTam
                      ? [
                          { label: "Touch Rate", touchRate: true },
                          { label: "Call→Con %", numKey: "connects", denKey: "calls" },
                          { label: "Con→Demo %", numKey: "demos", denKey: "connects" },
                          { label: "Demo→Win %", numKey: "wins", denKey: "demos" },
                        ]
                      : [
                          { label: "TAM→Call %", numKey: "calls", denKey: "tam" },
                          { label: "Call→Con %", numKey: "connects", denKey: "calls" },
                          { label: "Con→Demo %", numKey: "demos", denKey: "connects" },
                          { label: "Demo→Win %", numKey: "wins", denKey: "demos" },
                        ];
                    const allRows = [
                      ...metricRows.map((met, metIdx) => (
                        <tr key={`${m.id}-${met.key}`} className={`${metIdx === 0 ? "border-t-2 border-border" : ""}`}>
                        {metIdx === 0 && (
                            <td rowSpan={metricRows.length + convRates.length} className={`sticky left-0 z-30 bg-card py-2 pl-5 pr-2 font-semibold align-top border-r border-border/50 whitespace-nowrap ${m.isActive ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                              {m.name}
                              {!m.isActive && <span className="block text-[10px] font-normal not-italic text-muted-foreground/60">Former</span>}
                            </td>
                          )}
                          <td className="sticky z-20 bg-card py-1 px-2 text-xs text-muted-foreground whitespace-nowrap" style={{ left: playerColW }}>{met.label}</td>
                          {weeks.map((w) => {
                            const val = met.key === "tam"
                              ? (hasMetricsTam ? m.touchedTam : getCarriedTam(m, w.key, weekKeyList))
                              : getMemberFunnel(m, w.key)[met.key];
                            return (
                              <td key={w.key} className="text-center py-1 px-2 text-foreground tabular-nums">
                                {val > 0 ? val : <span className="text-muted-foreground/40">—</span>}
                              </td>
                            );
                          })}
                          <td className="sticky right-0 z-10 bg-card text-center py-1 pl-2 pr-5 font-semibold text-primary tabular-nums">
                            {met.key === "tam"
                              ? (hasMetricsTam ? (m.touchedTam || "—") : (getCarriedTam(m, weekKeyList[weekKeyList.length - 1] ?? "", weekKeyList) || "—"))
                              : weeks.reduce((s, w) => s + getMemberFunnel(m, w.key)[met.key], 0)}
                          </td>
                        </tr>
                      )),
                      ...convRates.map((cr) => (
                        <tr key={`${m.id}-${cr.label}`} className="bg-muted/30">
                          <td className="sticky z-20 bg-card py-1 px-2 text-xs font-medium text-accent whitespace-nowrap" style={{ left: playerColW }}>{cr.label}</td>
                          {cr.touchRate ? (
                            <>
                              {weeks.map((w) => (
                                <td key={w.key} className="text-center py-1 px-2 text-accent tabular-nums text-xs font-semibold">
                                  <span className="text-muted-foreground/40">—</span>
                                </td>
                              ))}
                            </>
                          ) : weeks.map((w) => {
                            const f = getMemberFunnel(m, w.key);
                            const den = cr.denKey === "tam"
                              ? getCarriedTam(m, w.key, weekKeyList)
                              : f[cr.denKey!];
                            const num = f[cr.numKey!];
                            const pct = den > 0 ? ((num / den) * 100).toFixed(0) : "—";
                            return (
                              <td key={w.key} className="text-center py-1 px-2 text-accent tabular-nums text-xs font-semibold">
                                {pct === "—" ? <span className="text-muted-foreground/40">—</span> : `${pct}%`}
                              </td>
                            );
                          })}
                          <td className="sticky right-0 z-10 bg-card text-center py-1 pl-2 pr-5 font-semibold text-accent tabular-nums text-xs">
                            {cr.touchRate
                              ? (m.touchedTam > 0 ? `${((m.touchedAccounts / m.touchedTam) * 100).toFixed(0)}%` : "—")
                              : (() => {
                                  const totalDen = cr.denKey === "tam"
                                    ? weeks.reduce((s, w) => s + getCarriedTam(m, w.key, weekKeyList), 0)
                                    : weeks.reduce((s, w) => s + getMemberFunnel(m, w.key)[cr.denKey!], 0);
                                  const totalNum = weeks.reduce((s, w) => s + getMemberFunnel(m, w.key)[cr.numKey!], 0);
                                  return totalDen > 0 ? `${((totalNum / totalDen) * 100).toFixed(0)}%` : "—";
                                })()
                            }
                          </td>
                        </tr>
                      )),
                    ];
                    return allRows;
                  });
                })()}
                {/* ── Team Monthly Aggregate ── */}
                <tr>
                  <td colSpan={teamWeeks.length + 3} className="py-0">
                    <div className="border-t-4 border-primary/40" />
                  </td>
                </tr>
                {(() => {
                  const hasMetricsTam = members.some((m) => m.touchedTam > 0);
                  const teamMonths = getTeamMonthKeys(teamWeeks);
                  const weekKeyList = teamWeeks.map((wk) => wk.key);
                  const allMetricRows: { label: string; key: keyof FunnelData }[] = [
                    { label: "TAM", key: "tam" },
                    { label: "Call", key: "calls" },
                    { label: "Connect", key: "connects" },
                    { label: "Ops", key: "ops" },
                    { label: "Demo", key: "demos" },
                    { label: "Win", key: "wins" },
                    { label: "Feedback", key: "feedback" },
                    { label: "Activity", key: "activity" },
                  ];
                  const alwaysShow = new Set<string>(["tam", "connects"]);
                  const metricRows = allMetricRows.filter(
                    (r) => alwaysShow.has(r.key) || team.enabledGoals[r.key as keyof typeof team.enabledGoals]
                  );
                  const convRates: { label: string; numKey?: keyof FunnelData; denKey?: keyof FunnelData; touchRate?: boolean }[] = hasMetricsTam
                    ? [
                        { label: "Touch Rate", touchRate: true },
                        { label: "Call→Con %", numKey: "connects", denKey: "calls" },
                        { label: "Con→Demo %", numKey: "demos", denKey: "connects" },
                        { label: "Demo→Win %", numKey: "wins", denKey: "demos" },
                      ]
                    : [
                        { label: "TAM→Call %", numKey: "calls", denKey: "tam" },
                        { label: "Call→Con %", numKey: "connects", denKey: "calls" },
                        { label: "Con→Demo %", numKey: "demos", denKey: "connects" },
                        { label: "Demo→Win %", numKey: "wins", denKey: "demos" },
                      ];
                  const getTeamMonthlyValue = (monthWeekKeys: string[], metKey: keyof FunnelData): number => {
                    if (metKey === "tam") {
                      if (hasMetricsTam) return members.reduce((sum, m) => sum + m.touchedTam, 0);
                      return members.reduce((sum, m) => {
                        const lastWeek = monthWeekKeys[monthWeekKeys.length - 1];
                        return sum + getCarriedTam(m, lastWeek, weekKeyList);
                      }, 0);
                    }
                    return members.reduce((sum, m) =>
                      sum + monthWeekKeys.reduce((ws, wk) => ws + getMemberFunnel(m, wk)[metKey], 0), 0);
                  };
                  const teamTouchRate = (() => {
                    const ta = members.reduce((s, m) => s + m.touchedAccounts, 0);
                    const tt = members.reduce((s, m) => s + m.touchedTam, 0);
                    return tt > 0 ? `${((ta / tt) * 100).toFixed(0)}%` : "—";
                  })();
                  return [
                    <tr key="team-month-header" className="border-t border-border bg-secondary">
                      <td className="sticky left-0 z-30 bg-secondary py-2 pl-5 pr-2 font-bold text-white align-top border-r border-border/50 whitespace-nowrap" rowSpan={metricRows.length + convRates.length + 1}>
                        Team
                      </td>
                      <td className="sticky z-20 bg-secondary py-2 px-2 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap" style={{ left: playerColW }}></td>
                      {teamMonths.map((mo) => (
                        <td key={mo.key} colSpan={mo.colSpan} className="text-center py-2 px-2 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap bg-secondary">
                          {mo.label}
                        </td>
                      ))}
                      <td className="sticky right-0 z-10 bg-secondary text-center py-2 pl-2 pr-5 text-xs font-semibold text-white uppercase tracking-wider">Total</td>
                    </tr>,
                    ...metricRows.map((met) => (
                      <tr key={`team-${met.key}`}>
                        <td className="sticky z-20 bg-card py-1 px-2 text-xs text-muted-foreground whitespace-nowrap" style={{ left: playerColW }}>{met.label}</td>
                        {teamMonths.map((mo) => {
                          const val = getTeamMonthlyValue(mo.weekKeys, met.key);
                          return (
                            <td key={mo.key} colSpan={mo.colSpan} className="text-center py-1 px-2 text-foreground tabular-nums font-medium">
                              {val > 0 ? val : <span className="text-muted-foreground/40">—</span>}
                            </td>
                          );
                        })}
                        <td className="sticky right-0 z-10 bg-card text-center py-1 pl-2 pr-5 font-semibold text-primary tabular-nums">
                          {met.key === "tam"
                            ? (hasMetricsTam
                                ? (members.reduce((s, m) => s + m.touchedTam, 0) || "—")
                                : (members.reduce((s, m) => s + getCarriedTam(m, weekKeyList[weekKeyList.length - 1] ?? "", weekKeyList), 0) || "—"))
                            : teamMonths.reduce((s, mo) => s + getTeamMonthlyValue(mo.weekKeys, met.key), 0)}
                        </td>
                      </tr>
                    )),
                    ...convRates.map((cr) => (
                      <tr key={`team-${cr.label}`} className="bg-muted/30">
                        <td className="sticky z-20 bg-card py-1 px-2 text-xs font-medium text-accent whitespace-nowrap" style={{ left: playerColW }}>{cr.label}</td>
                        {cr.touchRate ? (
                          <>
                            {teamMonths.map((mo) => (
                              <td key={mo.key} colSpan={mo.colSpan} className="text-center py-1 px-2 text-accent tabular-nums text-xs font-semibold">
                                <span className="text-muted-foreground/40">—</span>
                              </td>
                            ))}
                          </>
                        ) : teamMonths.map((mo) => {
                          const num = getTeamMonthlyValue(mo.weekKeys, cr.numKey!);
                          const den = getTeamMonthlyValue(mo.weekKeys, cr.denKey!);
                          const pct = den > 0 ? ((num / den) * 100).toFixed(0) : "—";
                          return (
                            <td key={mo.key} colSpan={mo.colSpan} className="text-center py-1 px-2 text-accent tabular-nums text-xs font-semibold">
                              {pct === "—" ? <span className="text-muted-foreground/40">—</span> : `${pct}%`}
                            </td>
                          );
                        })}
                        <td className="sticky right-0 z-10 bg-card text-center py-1 pl-2 pr-5 font-semibold text-accent tabular-nums text-xs">
                          {cr.touchRate
                            ? teamTouchRate
                            : (() => {
                                const totalNum = getTeamMonthlyValue(weekKeyList, cr.numKey!);
                                const totalDen = getTeamMonthlyValue(weekKeyList, cr.denKey!);
                                return totalDen > 0 ? `${((totalNum / totalDen) * 100).toFixed(0)}%` : "—";
                              })()
                          }
                        </td>
                      </tr>
                    )),
                  ];
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== ACTIVATION / ADOPTION (placeholder) ===== */}
      <div id="activation-adoption" className="scroll-mt-16" />

      {/* ===== GTMx IMPACT (placeholder) ===== */}
      <div id="gtmx-impact" className="scroll-mt-16" />
    </div>
  );
}

function WeekOverWeekView({ team }: { team: Team }) {
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set(["Call", "Connect", "Demo", "Win"]));
  const chartColors = useChartColors();
  const members = team.members;
  const weeks = getTeamWeekKeys(team.startDate, team.endDate);
  const currentWeek = getCurrentWeekKey();

  const METRIC_COLORS: Record<string, string> = {
    TAM: "hsl(340, 55%, 55%)",
    Call: "hsl(215, 55%, 55%)",
    Connect: "hsl(140, 50%, 45%)",
    Ops: "hsl(30, 65%, 50%)",
    Demo: "hsl(280, 50%, 58%)",
    Win: "hsl(24, 85%, 55%)",
    Feedback: "hsl(190, 55%, 50%)",
    Activity: "hsl(60, 60%, 45%)",
  };
  const metricKeys: { key: keyof FunnelData; label: string }[] = [
    { key: "tam", label: "TAM" },
    { key: "calls", label: "Call" },
    { key: "connects", label: "Connect" },
    { key: "ops", label: "Ops" },
    { key: "demos", label: "Demo" },
    { key: "wins", label: "Win" },
    { key: "feedback", label: "Feedback" },
    { key: "activity", label: "Activity" },
  ];

  const weekKeyList = weeks.map((w) => w.key);
  const hasMetricsTam = members.some((m) => m.touchedTam > 0);

  const chartData = weeks.map((week) => {
    const row: any = { week: week.label };
    metricKeys.forEach(({ key, label }) => {
      row[label] = key === "tam"
        ? (hasMetricsTam
            ? members.reduce((s, m) => s + m.touchedTam, 0)
            : members.reduce((s, m) => s + getCarriedTam(m, week.key, weekKeyList), 0))
        : members.reduce((s, m) => s + getMemberFunnel(m, week.key)[key], 0);
    });
    members.forEach((m) => {
      if (selectedPlayers.has(m.id)) {
        metricKeys.forEach(({ key, label }) => {
          row[`${m.name} ${label}`] = key === "tam"
            ? (hasMetricsTam ? m.touchedTam : getCarriedTam(m, week.key, weekKeyList))
            : getMemberFunnel(m, week.key)[key];
        });
      }
    });
    const roles: Record<string, string> = {};
    members.forEach((m) => {
      const funnel = m.funnelByWeek?.[week.key] as WeeklyFunnel | undefined;
      if (funnel?.role) roles[m.name] = funnel.role;
    });
    row._roles = roles;
    return row;
  });

  const togglePlayer = (id: string) => {
    setSelectedPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleMetric = (label: string) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const selectedMembers = members.filter((m) => selectedPlayers.has(m.id));
  const PLAYER_COLORS = [
    "hsl(350, 60%, 58%)",
    "hsl(180, 45%, 48%)",
    "hsl(45, 70%, 55%)",
    "hsl(300, 45%, 55%)",
    "hsl(160, 50%, 42%)",
  ];

  const FunnelTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const roles: Record<string, string> = payload[0]?.payload?._roles || {};
    return (
      <div style={{ backgroundColor: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: "8px", color: chartColors.tooltipText, padding: "10px 14px", fontSize: 12 }}>
        <p style={{ fontWeight: 600, marginBottom: 6 }}>{label}</p>
        {payload.filter((e: any) => !e.dataKey?.startsWith("_")).map((entry: any, i: number) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 0" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: entry.color, display: "inline-block", flexShrink: 0 }} />
            <span>{entry.name}: <strong>{entry.value}</strong></span>
          </div>
        ))}
        {Object.keys(roles).length > 0 && (
          <div style={{ borderTop: `1px solid ${chartColors.tooltipBorder}`, marginTop: 6, paddingTop: 6 }}>
            <p style={{ fontSize: 10, opacity: 0.6, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Roles this week</p>
            {Object.entries(roles).map(([name, role]) => (
              <p key={name} style={{ margin: "2px 0" }}>{name}: <strong>{role as string}</strong></p>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 glow-card">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-foreground">
          {team.name} — Funnel Overview
        </h2>
        <div className="flex flex-wrap gap-1">
          {metricKeys.map(({ label }) => {
            const isActive = selectedMetrics.has(label);
            return (
              <button
                key={label}
                onClick={() => toggleMetric(label)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  isActive
                    ? "shadow text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                style={isActive ? { backgroundColor: METRIC_COLORS[label] } : {}}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis dataKey="week" tick={{ fill: chartColors.axisText, fontSize: 12 }} axisLine={{ stroke: chartColors.axisLine }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: chartColors.axisText, fontSize: 12 }} axisLine={{ stroke: chartColors.axisLine }} tickLine={false} />
            <Tooltip content={<FunnelTooltip />} />
            <Legend />
            {metricKeys.map(({ label }) =>
              selectedMetrics.has(label) ? (
                <Line key={label} type="monotone" dataKey={label} stroke={METRIC_COLORS[label]} strokeWidth={2.5} dot={{ r: 4 }} />
              ) : null
            )}
            
            {members.map((m, i) =>
              selectedPlayers.has(m.id)
                ? metricKeys.filter(({ label }) => selectedMetrics.has(label)).map(({ label }) => (
                    <Line key={`${m.id}-${label}`} type="monotone" dataKey={`${m.name} ${label}`} stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]} strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 3 }} />
                  ))
                : null
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {members.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Select players</p>
          <div className="flex flex-wrap gap-2">
            {members.map((m, i) => {
              const isActive = selectedPlayers.has(m.id);
              const weekFunnel = getMemberFunnel(m, currentWeek) as WeeklyFunnel;
              const role = weekFunnel.role || "—";
              return (
                <button
                  key={m.id}
                  onClick={() => togglePlayer(m.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all flex flex-col items-center ${
                    isActive
                      ? "shadow"
                      : `bg-muted text-muted-foreground hover:bg-muted/80 ${!m.isActive ? "opacity-50" : ""}`
                  }`}
                  style={isActive ? { backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length], color: "white" } : {}}
                >
                  <span>{m.name}{!m.isActive ? " (Former)" : ""}</span>
                  <span className="text-[10px] opacity-70 font-normal">{role}</span>
                </button>
              );
            })}
          </div>

          {selectedMembers.length > 0 && (
            <div className="mt-3 space-y-2">
              {selectedMembers.map((m) => {
                const validWeeks = weeks.filter((w) => {
                  const f = getMemberFunnel(m, w.key);
                  const tam = hasMetricsTam ? m.touchedTam : getCarriedTam(m, w.key, weekKeyList);
                  return tam > 0 || f.calls > 0 || f.connects > 0 || f.demos > 0 || f.wins > 0;
                });
                const n = validWeeks.length;
                const firstConvRate = hasMetricsTam
                  ? (m.touchedTam > 0 ? (m.touchedAccounts / m.touchedTam) * 100 : 0)
                  : (n > 0
                      ? validWeeks.reduce((s, w) => { const f = getMemberFunnel(m, w.key); const tam = getCarriedTam(m, w.key, weekKeyList); return s + (tam > 0 ? (f.calls / tam) * 100 : 0); }, 0) / n
                      : 0);
                const avgCallToConnect = n > 0
                  ? validWeeks.reduce((s, w) => { const f = getMemberFunnel(m, w.key); return s + (f.calls > 0 ? (f.connects / f.calls) * 100 : 0); }, 0) / n : 0;
                const avgConnectToDemo = n > 0
                  ? validWeeks.reduce((s, w) => { const f = getMemberFunnel(m, w.key); return s + (f.connects > 0 ? (f.demos / f.connects) * 100 : 0); }, 0) / n : 0;
                const avgDemoToWin = n > 0
                  ? validWeeks.reduce((s, w) => { const f = getMemberFunnel(m, w.key); return s + (f.demos > 0 ? (f.wins / f.demos) * 100 : 0); }, 0) / n : 0;
                return (
                  <div key={m.id} className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-semibold" style={{ color: PLAYER_COLORS[members.indexOf(m) % PLAYER_COLORS.length] }}>{m.name}:</span>
                    <span>{hasMetricsTam ? "Touch Rate" : "TAM→Call"}: <strong className="text-foreground">{firstConvRate.toFixed(0)}%</strong></span>
                    <span>Call→Connect: <strong className="text-foreground">{avgCallToConnect.toFixed(0)}%</strong></span>
                    <span>Connect→Demo: <strong className="text-foreground">{avgConnectToDemo.toFixed(0)}%</strong></span>
                    <span>Demo→Win: <strong className="text-foreground">{avgDemoToWin.toFixed(0)}%</strong></span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 glow-card">
      {icon}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-display text-lg font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export default Index;
