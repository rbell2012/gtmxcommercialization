import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Trophy, Plus, Target, Users, TrendingUp, MessageCircle } from "lucide-react";
import { useTeams, type Team, type TeamMember, type WinEntry, type FunnelData, type WeeklyFunnel, type WeeklyRole, pilotNameToSlug } from "@/contexts/TeamsContext";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";

interface TestPhase {
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

const DEFAULT_ROLES = ["TOFU", "Closing", "No Funnel Activity"];

const emptyFunnel: WeeklyFunnel = { tam: 0, calls: 0, connects: 0, demos: 0, wins: 0 };

function getWeekKeys(count = 8): { key: string; label: string }[] {
  const weeks: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const sun = new Date(d);
    sun.setDate(d.getDate() - d.getDay());
    const key = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, "0")}-${String(sun.getDate()).padStart(2, "0")}`;
    const label = `${sun.getMonth() + 1}/${sun.getDate()}`;
    weeks.push({ key, label });
  }
  return weeks;
}

function getCurrentWeekKey(): string {
  return getWeekKeys(1)[0].key;
}

function getMemberFunnel(m: TeamMember, weekKey: string): WeeklyFunnel {
  return m.funnelByWeek?.[weekKey] ?? { ...emptyFunnel };
}

function getMemberTotalWins(m: TeamMember): number {
  return Object.values(m.funnelByWeek || {}).reduce((s, f) => s + f.wins, 0);
}

const BAR_COLORS = [
  "hsl(24, 95%, 53%)",
  "hsl(210, 80%, 45%)",
  "hsl(30, 100%, 48%)",
  "hsl(200, 70%, 50%)",
  "hsl(15, 85%, 55%)",
];

// Duck component
const Duck = ({ size = 24 }: { size?: number }) => (
  <span style={{ fontSize: size }} role="img" aria-label="duck">
    🦆
  </span>
);

// Celebration overlay
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
      {/* Floating ducks */}
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

const Index = () => {
  const { pilotId } = useParams<{ pilotId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const loadState = <T,>(key: string, fallback: T): T => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) return JSON.parse(saved);
    } catch { /* ignore */ }
    return fallback;
  };

  const { teams, updateTeam } = useTeams();
  const [editingField, setEditingField] = useState<string | null>(null);

  const resolvedTeam = pilotId
    ? teams.find((t) => pilotNameToSlug(t.name) === pilotId) ?? teams[0]
    : teams[0];
  const activeTab = resolvedTeam.id;
  const [selectedMember, setSelectedMember] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [storyText, setStoryText] = useState("");
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [detailMember, setDetailMember] = useState<TeamMember | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [phases, setPhases] = useState<TestPhase[]>(() => loadState("gtmx-phases", INITIAL_PHASES));
  const [customRoles, setCustomRoles] = useState<string[]>(() => loadState("gtmx-custom-roles", []));
  const [extendTestOpen, setExtendTestOpen] = useState(false);
  const [newMonthName, setNewMonthName] = useState("");
  const [newMonthPurpose, setNewMonthPurpose] = useState("");
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [missionPurpose, setMissionPurpose] = useState(() => loadState("gtmx-mission", ""));
  const [missionSubmitted, setMissionSubmitted] = useState(() => loadState("gtmx-mission-submitted", false));
  const [totalTam, setTotalTam] = useState<number>(() => loadState("gtmx-total-tam", 0));
  const [tamSubmitted, setTamSubmitted] = useState(() => loadState("gtmx-tam-submitted", false));
  
  useEffect(() => { localStorage.setItem("gtmx-phases", JSON.stringify(phases)); }, [phases]);
  useEffect(() => { localStorage.setItem("gtmx-custom-roles", JSON.stringify(customRoles)); }, [customRoles]);
  useEffect(() => { localStorage.setItem("gtmx-mission", JSON.stringify(missionPurpose)); }, [missionPurpose]);
  useEffect(() => { localStorage.setItem("gtmx-mission-submitted", JSON.stringify(missionSubmitted)); }, [missionSubmitted]);
  useEffect(() => { localStorage.setItem("gtmx-total-tam", JSON.stringify(totalTam)); }, [totalTam]);
  useEffect(() => { localStorage.setItem("gtmx-tam-submitted", JSON.stringify(tamSubmitted)); }, [tamSubmitted]);

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

  const activeTeam = teams.find((t) => t.id === activeTab)!;

  const addPhase = () => {
    if (!newMonthName.trim()) return;
    setPhases((prev) => [
      ...prev,
      { id: `m${prev.length + 1}`, month: newMonthName.trim(), label: newMonthPurpose.trim() || "TBD", progress: 0 },
    ]);
    setNewMonthName("");
    setNewMonthPurpose("");
    setExtendTestOpen(false);
  };

  const addRole = () => {
    if (!newRoleName.trim() || allRoles.includes(newRoleName.trim())) return;
    setCustomRoles((prev) => [...prev, newRoleName.trim()]);
    setNewRoleName("");
    setAddRoleOpen(false);
  };

  const addWin = () => {
    if (!selectedMember || !restaurantName.trim()) return;

    const member = activeTeam.members.find((m) => m.id === selectedMember);
    if (!member) return;

    const entry: WinEntry = {
      id: Date.now().toString(),
      restaurant: restaurantName.trim(),
      story: storyText.trim() || undefined,
      date: new Date().toLocaleDateString(),
    };

    const newWinCount = member.wins.length + 1;
    const prevMilestone = Math.floor((member.wins.length / member.goal) * 10);
    const newMilestone = Math.floor((newWinCount / member.goal) * 10);
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
        description: `${member.name} hit ${newMilestone * 10}% of their goal!`,
      });
    }

    setSelectedMember("");
    setRestaurantName("");
    setStoryText("");
  };

  const addMember = () => {
    if (!newName.trim()) return;
    updateTeam(activeTab, (team) => ({
      ...team,
      members: [
        ...team.members,
        { id: Date.now().toString(), name: newName.trim(), goal: parseInt(newGoal) || 30, wins: [], ducksEarned: 0, funnelByWeek: {} },
      ],
    }));
    setNewName("");
    setNewGoal("");
    setAddMemberOpen(false);
  };

  const handleBarClick = (data: any) => {
    const member = activeTeam.members.find((m) => m.name === data.name);
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
              const total = team.members.reduce((s, m) => getMemberTotalWins(m), 0);
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
            <div className="flex items-center gap-2">
              <Dialog open={extendTestOpen} onOpenChange={setExtendTestOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5 border-border text-foreground hover:bg-muted text-xs">
                    <Plus className="h-3.5 w-3.5" /> Extend the Test
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border">
                  <DialogHeader>
                    <DialogTitle className="font-display text-foreground">Extend the Test</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 pt-2">
                    <Input placeholder="Month name (e.g. Month 4)" value={newMonthName} onChange={(e) => setNewMonthName(e.target.value)} className="bg-secondary/20 border-border text-foreground placeholder:text-muted-foreground" />
                    <Textarea placeholder="Purpose of this month" value={newMonthPurpose} onChange={(e) => setNewMonthPurpose(e.target.value)} className="bg-secondary/20 border-border text-foreground placeholder:text-muted-foreground" rows={3} />
                    <Button onClick={addPhase} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">Add Month</Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Slider
                value={[phases.reduce((sum, p) => sum + p.progress, 0) / phases.length]}
                onValueChange={([val]) => {
                  setPhases((prev) => {
                    const newPhases = [...prev];
                    const perPhase = 100 / newPhases.length;
                    newPhases.forEach((p, i) => {
                      const phaseStart = i * perPhase;
                      const phaseEnd = (i + 1) * perPhase;
                      if (val >= phaseEnd) {
                        newPhases[i] = { ...p, progress: 100 };
                      } else if (val <= phaseStart) {
                        newPhases[i] = { ...p, progress: 0 };
                      } else {
                        newPhases[i] = { ...p, progress: Math.round(((val - phaseStart) / perPhase) * 100) };
                      }
                    });
                    return newPhases;
                  });
                }}
                max={100}
                step={1}
                className="w-32"
              />
            </div>
          </div>
          {/* Segmented progress bar */}
          <div className="flex h-6 w-full overflow-hidden rounded-full bg-muted">
            {phases.map((phase, i) => {
              const colors = ["hsl(24, 95%, 53%)", "hsl(210, 80%, 45%)", "hsl(30, 100%, 48%)", "hsl(160, 60%, 45%)", "hsl(280, 60%, 55%)", "hsl(45, 80%, 50%)"];
              const widthPct = 100 / phases.length;
              const fillPct = phase.progress;
              return (
                <div key={phase.id} className="relative h-full" style={{ width: `${widthPct}%` }}>
                  <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{
                      width: `${fillPct}%`,
                      backgroundColor: colors[i],
                      borderRadius: i === 0 && fillPct > 0 ? "9999px 0 0 9999px" : i === phases.length - 1 && fillPct >= 100 ? "0 9999px 9999px 0" : "0",
                    }}
                  />
                  {i < phases.length - 1 && <div className="absolute right-0 top-0 h-full w-px bg-border" />}
                </div>
              );
            })}
          </div>
          <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))` }}>
            {phases.map((phase, i) => {
              const colors = ["text-primary", "text-accent", "text-primary", "text-accent", "text-primary", "text-accent"];
              return (
                <div key={phase.id} className="text-center">
                  <p className={`text-xs font-semibold ${colors[i % colors.length]}`}>{phase.month}</p>
                  <Input
                    value={phase.label}
                    onChange={(e) => setPhases((prev) => prev.map((p) => p.id === phase.id ? { ...p, label: e.target.value } : p))}
                    className="h-5 w-full text-[10px] text-center bg-transparent border-none shadow-none p-0 text-muted-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/50"
                  />
                  <p className="text-[10px] text-muted-foreground">{phase.progress}%</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mission & Purpose */}
        <div className={`mb-4 rounded-lg border bg-card p-5 glow-card ${missionSubmitted ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
          <div className="flex items-center justify-between mb-2">
            <label className="font-display text-lg font-semibold text-foreground">Mission & Purpose of Test</label>
            {missionSubmitted && <span className="text-xs font-medium text-primary">✅ Submitted</span>}
          </div>
          <Textarea
            value={missionPurpose}
            onChange={(e) => setMissionPurpose(e.target.value)}
            placeholder="Describe the mission and purpose of this test..."
            className="bg-secondary/20 border-border text-foreground placeholder:text-muted-foreground text-sm"
            rows={3}
            disabled={missionSubmitted}
          />
          <div className="mt-3 flex justify-end">
            {!missionSubmitted ? (
              <Button size="sm" onClick={() => setMissionSubmitted(true)} className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-8 px-4">
                Submit
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setMissionSubmitted(false)} className="text-xs h-7 border-border text-muted-foreground hover:text-foreground">
                Edit
              </Button>
            )}
          </div>
        </div>

        {/* Total TAM */}
        <div className={`mb-8 rounded-lg border bg-card p-5 glow-card ${tamSubmitted ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="font-display text-lg font-semibold text-foreground">Total TAM</label>
              <Input
                type="number"
                min={0}
                value={totalTam || ""}
                onChange={(e) => setTotalTam(Math.max(0, parseInt(e.target.value) || 0))}
                className="h-9 w-36 bg-secondary/20 border-border text-foreground text-sm"
                placeholder="0"
                disabled={tamSubmitted}
              />
              {tamSubmitted && <span className="text-xs font-medium text-primary">✅ Submitted</span>}
            </div>
            {!tamSubmitted ? (
              <Button size="sm" onClick={() => setTamSubmitted(true)} className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-8 px-4">
                Submit
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setTamSubmitted(false)} className="text-xs h-7 border-border text-muted-foreground hover:text-foreground">
                Edit
              </Button>
            )}
          </div>
        </div>

        {/* Win Goals - active team only */}
        {teams.filter((t) => t.id === activeTab).map((team) => {
          const members = team.members;
          return (
            <div key={team.id} className="mb-6 rounded-lg border border-border bg-card p-5 glow-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-foreground">Win Goals – {team.name}</h3>
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
              <div className="space-y-4">
                {members.map((m, i) => {
                  const totalWins = getMemberTotalWins(m);
                  const pct = Math.min((totalWins / m.goal) * 100, 100);
                  return (
                    <div key={m.id}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{m.name}</span>
                          {m.ducksEarned > 0 && (
                            <span className="flex items-center">
                              {[...Array(m.ducksEarned)].map((_, j) => (
                                <span key={j} className="text-xs">🦆</span>
                              ))}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            value={m.goal || ""}
                            onChange={(e) => {
                              const num = Math.max(0, parseInt(e.target.value) || 0);
                              updateTeam(team.id, (t) => ({
                                ...t,
                                members: t.members.map((mem) =>
                                  mem.id === m.id ? { ...mem, goal: num } : mem
                                ),
                              }));
                            }}
                            className="h-7 w-20 bg-background border-border/50 text-foreground text-sm text-center"
                          />
                          <span className="text-sm text-muted-foreground">{totalWins} / {m.goal} ({pct.toFixed(0)}%)</span>
                        </div>
                      </div>
                      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full transition-all duration-700 ease-out ${i % 2 === 0 ? "progress-bar-orange" : "progress-bar-blue"}`} style={{ width: `${pct}%` }} />
                      </div>
                      {totalWins >= m.goal && <p className="mt-1 text-xs font-medium text-primary animate-pulse-glow">🎉🦆 Goal reached! Great ducking job!</p>}
                    </div>
                  );
                })}
              </div>
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
              <Input placeholder="Win goal (e.g. 40)" type="number" value={newGoal} onChange={(e) => setNewGoal(e.target.value)} className="bg-secondary/20 border-border text-foreground placeholder:text-muted-foreground" />
              <Button onClick={addMember} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">Add</Button>
            </div>
          </DialogContent>
        </Dialog>

          {teams.map((team) => (
            <TabsContent key={team.id} value={team.id}>
              <TeamTab
                team={team}
                totalTam={totalTam}
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
                {detailMember?.name}'s Wins ({detailMember?.wins.length} / {detailMember?.goal})
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
  totalTam,
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
  totalTam: number;
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
  const teamTotal = members.reduce((s, m) => getMemberTotalWins(m), 0);
  const teamGoalTotal = members.reduce((s, m) => s + m.goal, 0);
  const teamGoalPct = teamGoalTotal > 0 ? Math.min((teamTotal / teamGoalTotal) * 100, 100) : 0;
  const teamDucks = members.reduce((s, m) => s + m.ducksEarned, 0);

  const chartData = members.map((m) => ({
    name: m.name,
    wins: getMemberTotalWins(m),
    goal: m.goal,
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
                </div>
                <div className="text-right">
                  <div className="font-display text-4xl font-black text-primary">
                    {teamTotal}<span className="text-lg font-bold text-secondary-foreground/60">/{teamGoalTotal}</span>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-secondary-foreground/50">Wins</p>
                </div>
              </div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-secondary-foreground/50">Progress</span>
                <span className="font-display text-sm font-bold text-primary">{teamGoalPct.toFixed(0)}%</span>
              </div>
              <div className="h-5 w-full overflow-hidden rounded-full bg-secondary-foreground/10 shadow-inner">
                <div className="progress-bar-gradient h-full rounded-full transition-all duration-700 ease-out shadow-lg" style={{ width: `${teamGoalPct}%` }} />
              </div>
              {teamDucks > 0 && (
                <div className="mt-3 flex items-center gap-1">
                  {[...Array(Math.min(teamDucks, 20))].map((_, i) => (
                    <span key={i} className="text-lg hover-scale inline-block">🦆</span>
                  ))}
                </div>
              )}
              {teamTotal >= teamGoalTotal && teamGoalTotal > 0 && (
                <p className="mt-3 text-sm font-bold text-primary animate-pulse-glow">🎉 Team goal reached! Amazing work!</p>
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
                        <p className="font-display text-lg font-bold text-primary">{totalTam > 0 ? ((totals.calls / totalTam) * 100).toFixed(0) : 0}%</p>
                        <p className="text-[10px] text-secondary-foreground/50">TAM→Call</p>
                      </div>
                      <div className="rounded-md bg-secondary-foreground/5 py-2">
                        <p className="font-display text-lg font-bold text-accent">{totals.calls > 0 ? ((totals.connects / totals.calls) * 100).toFixed(0) : 0}%</p>
                        <p className="text-[10px] text-secondary-foreground/50">Call→Connect</p>
                      </div>
                      <div className="rounded-md bg-secondary-foreground/5 py-2">
                        <p className="font-display text-lg font-bold text-primary">{totals.connects > 0 ? ((totals.demos / totals.connects) * 100).toFixed(0) : 0}%</p>
                        <p className="text-[10px] text-secondary-foreground/50">Connect→Demo</p>
                      </div>
                      <div className="rounded-md bg-secondary-foreground/5 py-2">
                        <p className="font-display text-lg font-bold text-accent">{totals.demos > 0 ? ((totals.wins / totals.demos) * 100).toFixed(0) : 0}%</p>
                        <p className="text-[10px] text-secondary-foreground/50">Demo→Win</p>
                      </div>
                    </div>
                );
              })()}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard icon={<Users className="h-5 w-5 text-primary" />} label="Members" value={members.length} />
            <StatCard icon={<TrendingUp className="h-5 w-5 text-accent" />} label="Total Wins" value={teamTotal} />
          </div>

          {/* Empty state - add first member via Manager Inputs Win Goals */}
          {members.length === 0 && (
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

          {members.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5 glow-card">
              <div className="mb-4 flex items-baseline justify-between">
                <h3 className="font-display text-lg font-semibold text-foreground">Your Funnels</h3>
                <span className="text-xs text-muted-foreground italic">Update weekly by Tuesday noon</span>
              </div>
              <div className="space-y-4">
                {members.map((m) => {
                  const f = getMemberFunnel(m, currentWeek);
                  const role = (m.funnelByWeek?.[currentWeek] as WeeklyFunnel)?.role;
                  const updateFunnel = (field: keyof FunnelData, value: string) => {
                    const num = Math.max(0, parseInt(value) || 0);
                    updateTeam(team.id, (t) => ({
                      ...t,
                      members: t.members.map((mem) =>
                        mem.id === m.id ? { ...mem, funnelByWeek: { ...mem.funnelByWeek, [currentWeek]: { ...getMemberFunnel(mem, currentWeek), [field]: num } } } : mem
                      ),
                    }));
                  };
                  const updateRole = (val: string) => {
                    updateTeam(team.id, (t) => ({
                      ...t,
                      members: t.members.map((mem) =>
                        mem.id === m.id ? { ...mem, funnelByWeek: { ...mem.funnelByWeek, [currentWeek]: { ...getMemberFunnel(mem, currentWeek), role: val as WeeklyRole } } } : mem
                      ),
                    }));
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
                          <label className="text-xs font-medium text-muted-foreground">Demos</label>
                          <Input type="number" min={0} value={f.demos || ""} onChange={(e) => updateFunnel("demos", e.target.value)} disabled={f.submitted} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Wins</label>
                          <Input type="number" min={0} value={f.wins || ""} onChange={(e) => updateFunnel("wins", e.target.value)} disabled={f.submitted} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
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
                            <p className="text-[10px] text-muted-foreground italic">⏰ Totals due by team meeting</p>
                            <Button
                              size="sm"
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
                                              submitted: true,
                                              submittedAt: new Date().toLocaleDateString(),
                                            },
                                          },
                                        }
                                      : mem
                                  ),
                                }));
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
          <div className="rounded-lg border border-border bg-card p-5 glow-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Player</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Metric</th>
                  {getWeekKeys(8).map((w) => (
                    <th key={w.key} className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{w.label}</th>
                  ))}
                  <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, mIdx) => {
                  const metricRows: { label: string; key: keyof FunnelData }[] = [
                    { label: "TAM", key: "tam" },
                    { label: "Call", key: "calls" },
                    { label: "Connect", key: "connects" },
                    { label: "Demo", key: "demos" },
                    { label: "Win", key: "wins" },
                  ];
                  const weeks = getWeekKeys(8);
                  const allRows = [
                    ...metricRows.map((met, metIdx) => (
                      <tr key={`${m.id}-${met.key}`} className={`${metIdx === 0 ? "border-t-2 border-border" : ""}`}>
                      {metIdx === 0 && (
                          <td rowSpan={metricRows.length + 4} className="py-2 px-2 font-semibold text-foreground align-top border-r border-border/50">
                            {m.name}
                          </td>
                        )}
                        <td className="py-1 px-2 text-xs text-muted-foreground">{met.label}</td>
                        {weeks.map((w) => {
                          const val = getMemberFunnel(m, w.key)[met.key];
                          return (
                            <td key={w.key} className="text-center py-1 px-2 text-foreground tabular-nums">
                              {val > 0 ? val : <span className="text-muted-foreground/40">—</span>}
                            </td>
                          );
                        })}
                        <td className="text-center py-1 px-2 font-semibold text-primary tabular-nums">
                          {weeks.reduce((s, w) => s + getMemberFunnel(m, w.key)[met.key], 0)}
                        </td>
                      </tr>
                    )),
                    // Conversion rows
                    ...(() => {
                      const convRates = [
                        { label: "TAM→Call %", numKey: "calls" as keyof FunnelData, denKey: "tam" as keyof FunnelData },
                        { label: "Call→Con %", numKey: "connects" as keyof FunnelData, denKey: "calls" as keyof FunnelData },
                        { label: "Con→Demo %", numKey: "demos" as keyof FunnelData, denKey: "connects" as keyof FunnelData },
                        { label: "Demo→Win %", numKey: "wins" as keyof FunnelData, denKey: "demos" as keyof FunnelData },
                      ];
                      return convRates.map((cr) => (
                        <tr key={`${m.id}-${cr.label}`} className="bg-muted/30">
                          <td className="py-1 px-2 text-xs font-medium text-accent">{cr.label}</td>
                          {weeks.map((w) => {
                            const f = getMemberFunnel(m, w.key);
                            const den = f[cr.denKey];
                            const num = f[cr.numKey];
                            const pct = den > 0 ? ((num / den) * 100).toFixed(0) : "—";
                            return (
                              <td key={w.key} className="text-center py-1 px-2 text-accent tabular-nums text-xs font-semibold">
                                {pct === "—" ? <span className="text-muted-foreground/40">—</span> : `${pct}%`}
                              </td>
                            );
                          })}
                          <td className="text-center py-1 px-2 font-semibold text-accent tabular-nums text-xs">
                            {(() => {
                              const totalDen = weeks.reduce((s, w) => s + getMemberFunnel(m, w.key)[cr.denKey], 0);
                              const totalNum = weeks.reduce((s, w) => s + getMemberFunnel(m, w.key)[cr.numKey], 0);
                              return totalDen > 0 ? `${((totalNum / totalDen) * 100).toFixed(0)}%` : "—";
                            })()}
                          </td>
                        </tr>
                      ));
                    })(),
                  ];
                  return allRows;
                })}
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
  const members = team.members;
  const weeks = getWeekKeys(8);
  const currentWeek = getCurrentWeekKey();

  const METRIC_COLORS: Record<string, string> = {
    TAM: "hsl(340, 65%, 50%)",
    Call: "hsl(215, 65%, 50%)",
    Connect: "hsl(140, 60%, 40%)",
    Demo: "hsl(280, 60%, 55%)",
    Win: "hsl(24, 100%, 55%)",
  };
  const metricKeys: { key: keyof FunnelData; label: string }[] = [
    { key: "tam", label: "TAM" },
    { key: "calls", label: "Call" },
    { key: "connects", label: "Connect" },
    { key: "demos", label: "Demo" },
    { key: "wins", label: "Win" },
  ];

  // Build chart data: weeks on X-axis, one line per metric (team total)
  const chartData = weeks.map((week) => {
    const row: any = { week: week.label };
    metricKeys.forEach(({ key, label }) => {
      row[label] = members.reduce((s, m) => s + getMemberFunnel(m, week.key)[key], 0);
    });
    // Individual player metrics
    members.forEach((m) => {
      if (selectedPlayers.has(m.id)) {
        metricKeys.forEach(({ key, label }) => {
          row[`${m.name} ${label}`] = getMemberFunnel(m, week.key)[key];
        });
      }
    });
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
    "hsl(350, 70%, 55%)",
    "hsl(180, 50%, 40%)",
    "hsl(45, 80%, 50%)",
    "hsl(300, 50%, 50%)",
    "hsl(160, 60%, 35%)",
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-5 glow-card">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-foreground">
          {team.name} — Funnel Overview
        </h2>
        <div className="flex gap-1">
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
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 88%)" />
            <XAxis dataKey="week" tick={{ fill: "hsl(220, 10%, 45%)", fontSize: 12 }} axisLine={{ stroke: "hsl(220, 14%, 88%)" }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: "hsl(220, 10%, 45%)", fontSize: 12 }} axisLine={{ stroke: "hsl(220, 14%, 88%)" }} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: "hsl(0, 0%, 100%)", border: "1px solid hsl(220, 14%, 88%)", borderRadius: "8px", color: "hsl(220, 25%, 12%)" }} />
            <Legend />
            {/* Team total lines — only for selected metrics */}
            {metricKeys.map(({ label }) =>
              selectedMetrics.has(label) ? (
                <Line key={label} type="monotone" dataKey={label} stroke={METRIC_COLORS[label]} strokeWidth={2.5} dot={{ r: 4 }} />
              ) : null
            )}
            
            {/* Individual player lines when selected — only for selected metrics */}
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

      {/* Player selector — multi-select with roles */}
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
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  style={isActive ? { backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length], color: "white" } : {}}
                >
                  <span>{m.name}</span>
                  <span className="text-[10px] opacity-70 font-normal">{role}</span>
                </button>
              );
            })}
          </div>

          {/* Conversion rates for selected players */}
          {selectedMembers.length > 0 && (
            <div className="mt-3 space-y-2">
              {selectedMembers.map((m) => {
                const f = getMemberFunnel(m, currentWeek);
                return (
                  <div key={m.id} className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-semibold" style={{ color: PLAYER_COLORS[members.indexOf(m) % PLAYER_COLORS.length] }}>{m.name}:</span>
                    <span>TAM→Call: <strong className="text-foreground">{f.tam > 0 ? ((f.calls / f.tam) * 100).toFixed(0) : 0}%</strong></span>
                    <span>Call→Connect: <strong className="text-foreground">{f.calls > 0 ? ((f.connects / f.calls) * 100).toFixed(0) : 0}%</strong></span>
                    <span>Connect→Demo: <strong className="text-foreground">{f.connects > 0 ? ((f.demos / f.connects) * 100).toFixed(0) : 0}%</strong></span>
                    <span>Demo→Win: <strong className="text-foreground">{f.demos > 0 ? ((f.wins / f.demos) * 100).toFixed(0) : 0}%</strong></span>
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
