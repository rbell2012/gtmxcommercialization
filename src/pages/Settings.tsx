import { useState, useRef, useEffect } from "react";
import { Settings as SettingsIcon, Plus, Users, Trash2, Edit2, UserPlus, ArrowUpDown, ArrowUp, ArrowDown, Calendar, GripVertical, ArchiveRestore, ChevronDown, ChevronRight, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  useTeams,
  toMonthKey,
  getTeamMembersForMonth,
  GOAL_METRICS,
  GOAL_METRIC_LABELS,
  MEMBER_LEVELS,
  MEMBER_LEVEL_LABELS,
  DEFAULT_ENABLED_GOALS,
  DEFAULT_GOALS,
  DEFAULT_TEAM_GOALS_BY_LEVEL,
  type GoalMetric,
  type MemberLevel,
  type MemberGoals,
  type EnabledGoals,
  type AcceleratorConfig,
  type AcceleratorRule,
  type TeamGoalsByLevel,
  type GoalScopeConfig,
  DEFAULT_GOAL_SCOPE_CONFIG,
} from "@/contexts/TeamsContext";
import { generateTestPhases, splitPhases, isCurrentMonth, phaseToDate, type ComputedPhase } from "@/lib/test-phases";
import { getPhaseWinsLabel } from "@/lib/quota-helpers";
import { useToast } from "@/hooks/use-toast";

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
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

const Settings = () => {
  const {
    teams,
    unassignedMembers,
    addTeam,
    removeTeam,
    updateTeam,
    reorderTeams,
    reorderMembers,
    toggleTeamActive,
    createMember,
    assignMember,
    unassignMember,
    archiveMember,
    updateMember,
    teamGoalsHistory,
    memberTeamHistory,
    allMembersById,
    upsertTeamGoalsHistory,
    updateHistoricalRoster,
    archivedTeams,
    loadArchivedTeams,
    unarchiveTeam,
    archivedMembers,
    loadArchivedMembers,
    unarchiveMember,
  } = useTeams();
  const { toast } = useToast();

  const dragItem = useRef<string | null>(null);
  const dragOverItem = useRef<string | null>(null);

  const handleDragStart = (teamId: string) => {
    dragItem.current = teamId;
  };

  const handleDragOver = (e: React.DragEvent, teamId: string) => {
    e.preventDefault();
    dragOverItem.current = teamId;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragItem.current || !dragOverItem.current || dragItem.current === dragOverItem.current) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }
    const currentOrder = teams.map((t) => t.id);
    const dragIdx = currentOrder.indexOf(dragItem.current);
    const dropIdx = currentOrder.indexOf(dragOverItem.current);
    if (dragIdx === -1 || dropIdx === -1) return;
    currentOrder.splice(dragIdx, 1);
    currentOrder.splice(dropIdx, 0, dragItem.current);
    reorderTeams(currentOrder);
    toast({ title: "Team order updated" });
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const dragMember = useRef<string | null>(null);
  const dragOverMember = useRef<string | null>(null);

  const handleMemberDragStart = (memberId: string) => {
    dragMember.current = memberId;
  };

  const handleMemberDragOver = (e: React.DragEvent, memberId: string) => {
    e.preventDefault();
    dragOverMember.current = memberId;
  };

  const handleMemberDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragMember.current || !dragOverMember.current || dragMember.current === dragOverMember.current) {
      dragMember.current = null;
      dragOverMember.current = null;
      return;
    }
    const currentOrder = allMembers.map((m) => m.id);
    const dragIdx = currentOrder.indexOf(dragMember.current);
    const dropIdx = currentOrder.indexOf(dragOverMember.current);
    if (dragIdx === -1 || dropIdx === -1) return;
    currentOrder.splice(dragIdx, 1);
    currentOrder.splice(dropIdx, 0, dragMember.current);
    reorderMembers(currentOrder);
    setNameSort(null);
    toast({ title: "Member order updated" });
    dragMember.current = null;
    dragOverMember.current = null;
  };

  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamOwner, setNewTeamOwner] = useState("");
  const [newTeamStartDate, setNewTeamStartDate] = useState("");
  const [newTeamEndDate, setNewTeamEndDate] = useState("");

  const [createMemberOpen, setCreateMemberOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");

  const [editTeamId, setEditTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamOwner, setEditTeamOwner] = useState("");
  const [editTeamLeadRep, setEditTeamLeadRep] = useState("");
  const [editTeamStartDate, setEditTeamStartDate] = useState("");
  const [editTeamEndDate, setEditTeamEndDate] = useState("");
  const [editTeamParity, setEditTeamParity] = useState(false);
  const [editTeamGoals, setEditTeamGoals] = useState<MemberGoals>({ ...DEFAULT_GOALS });
  const [editEnabledGoals, setEditEnabledGoals] = useState<EnabledGoals>({ ...DEFAULT_ENABLED_GOALS });
  const [editAcceleratorConfig, setEditAcceleratorConfig] = useState<AcceleratorConfig>({});
  const [editTeamGoalsByLevel, setEditTeamGoalsByLevel] = useState<TeamGoalsByLevel>({ ...DEFAULT_TEAM_GOALS_BY_LEVEL });
  const [editGoalScopeConfig, setEditGoalScopeConfig] = useState<GoalScopeConfig>({ ...DEFAULT_GOAL_SCOPE_CONFIG });
  const [selectedEditMonth, setSelectedEditMonth] = useState<Date | null>(null);
  const [settingsPrevExpanded, setSettingsPrevExpanded] = useState(false);
  const [settingsNextExpanded, setSettingsNextExpanded] = useState(false);
  const [editTeamMembers, setEditTeamMembers] = useState<string[]>([]);
  const [editTeamMembersInitial, setEditTeamMembersInitial] = useState<string[]>([]);

  const [deleteTeamId, setDeleteTeamId] = useState<string | null>(null);

  const [endedExpanded, setEndedExpanded] = useState(false);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [unarchiveTeamId, setUnarchiveTeamId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const endedTeams = teams.filter((t) => !t.isActive && t.endDate && t.endDate < today);

  useEffect(() => {
    if (archivedExpanded) loadArchivedTeams();
  }, [archivedExpanded, loadArchivedTeams]);

  const confirmUnarchiveTeam = async () => {
    if (!unarchiveTeamId) return;
    const team = archivedTeams.find((t) => t.id === unarchiveTeamId);
    await unarchiveTeam(unarchiveTeamId);
    toast({
      title: "Team restored",
      description: `${team?.name} has been unarchived.`,
    });
    setUnarchiveTeamId(null);
  };

  const [nameSort, setNameSort] = useState<"asc" | "desc" | null>(null);

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<"name" | "goal" | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const inlineInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingMemberId && inlineInputRef.current) {
      inlineInputRef.current.focus();
      inlineInputRef.current.select();
    }
  }, [editingMemberId, editingField]);

  const startInlineEdit = (memberId: string, field: "name", currentValue: string) => {
    setEditingMemberId(memberId);
    setEditingField(field);
    setEditingValue(currentValue);
  };

  const saveInlineEdit = () => {
    if (!editingMemberId || !editingField) return;
    const trimmed = editingValue.trim();
    if (editingField === "name" && trimmed) {
      updateMember(editingMemberId, { name: trimmed });
      toast({ title: "Member updated", description: `Name changed to ${trimmed}.` });
    }
    cancelInlineEdit();
  };

  const cancelInlineEdit = () => {
    setEditingMemberId(null);
    setEditingField(null);
    setEditingValue("");
  };

  const handleCreateTeam = () => {
    if (!newTeamName.trim()) return;
    const sd = newTeamStartDate || null;
    const ed = newTeamEndDate || (sd ? addMonths(sd, 9) : null);
    addTeam(newTeamName.trim(), newTeamOwner.trim(), sd, ed);
    toast({ title: "Team created", description: `${newTeamName.trim()} has been added to the header.` });
    setNewTeamName("");
    setNewTeamOwner("");
    setNewTeamStartDate("");
    setNewTeamEndDate("");
    setCreateTeamOpen(false);
  };

  const handleCreateMember = () => {
    if (!newMemberName.trim()) return;
    createMember(newMemberName.trim());
    toast({ title: "Member created", description: `${newMemberName.trim()} is ready to be assigned to a team.` });
    setNewMemberName("");
    setCreateMemberOpen(false);
  };

  const confirmDeleteTeam = () => {
    if (!deleteTeamId) return;
    const team = teams.find((t) => t.id === deleteTeamId);
    removeTeam(deleteTeamId);
    toast({
      title: "Team archived",
      description: `${team?.name} has been archived.${team?.members.length ? " Members moved to unassigned." : ""}`,
    });
    setDeleteTeamId(null);
  };

  const startEditTeam = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    setEditTeamId(teamId);
    setEditTeamName(team.name);
    setEditTeamOwner(team.owner);
    setEditTeamLeadRep(team.leadRep);
    setEditTeamStartDate(team.startDate ?? "");
    setEditTeamEndDate(team.endDate ?? "");
    setEditTeamParity(team.goalsParity);
    setEditTeamGoals({ ...team.teamGoals });
    setEditEnabledGoals({ ...team.enabledGoals });
    setEditAcceleratorConfig({ ...team.acceleratorConfig });
    setEditTeamGoalsByLevel(JSON.parse(JSON.stringify(team.teamGoalsByLevel)));
    setEditGoalScopeConfig({ ...DEFAULT_GOAL_SCOPE_CONFIG, ...team.goalScopeConfig });
    setSelectedEditMonth(null);
    const currentRoster = team.members.filter((m) => m.isActive).map((m) => m.id);
    setEditTeamMembers(currentRoster);
    setEditTeamMembersInitial(currentRoster);
  };

  const saveEditTeam = () => {
    if (!editTeamId || !editTeamName.trim()) return;
    const isNonCurrentMonth = selectedEditMonth && !isCurrentMonth(selectedEditMonth);

    if (isNonCurrentMonth) {
      updateTeam(editTeamId, (t) => ({
        ...t,
        name: editTeamName.trim(),
        owner: editTeamOwner.trim(),
        leadRep: editTeamLeadRep.trim(),
        startDate: editTeamStartDate || null,
        endDate: editTeamEndDate || null,
      }));
      upsertTeamGoalsHistory(editTeamId, toMonthKey(selectedEditMonth), {
        goalsParity: editTeamParity,
        teamGoals: { ...editTeamGoals },
        enabledGoals: { ...editEnabledGoals },
        acceleratorConfig: { ...editAcceleratorConfig },
        teamGoalsByLevel: JSON.parse(JSON.stringify(editTeamGoalsByLevel)),
        goalScopeConfig: { ...editGoalScopeConfig },
      });
      updateHistoricalRoster(editTeamId, selectedEditMonth, editTeamMembers);
      const label = selectedEditMonth.toLocaleString("en-US", { month: "long", year: "numeric" });
      toast({ title: `Team updated for ${label}` });
    } else {
      updateTeam(editTeamId, (t) => ({
        ...t,
        name: editTeamName.trim(),
        owner: editTeamOwner.trim(),
        leadRep: editTeamLeadRep.trim(),
        startDate: editTeamStartDate || null,
        endDate: editTeamEndDate || null,
        goalsParity: editTeamParity,
        teamGoals: { ...editTeamGoals },
        enabledGoals: { ...editEnabledGoals },
        acceleratorConfig: { ...editAcceleratorConfig },
        teamGoalsByLevel: JSON.parse(JSON.stringify(editTeamGoalsByLevel)),
        goalScopeConfig: { ...editGoalScopeConfig },
      }));

      const added = editTeamMembers.filter((id) => !editTeamMembersInitial.includes(id));
      const removed = editTeamMembersInitial.filter((id) => !editTeamMembers.includes(id));
      for (const memberId of added) assignMember(memberId, editTeamId);
      for (const memberId of removed) unassignMember(memberId, editTeamId);

      toast({ title: "Team updated" });
    }
    setEditTeamId(null);
  };

  const allMembersUnsorted = [
    ...teams.flatMap((t) =>
      t.members.filter((m) => m.isActive).map((m) => ({ ...m, teamId: t.id as string | null, teamName: t.name }))
    ),
    ...unassignedMembers.filter((m) => m.isActive).map((m) => ({
      ...m,
      teamId: null as string | null,
      teamName: "Unassigned",
    })),
  ];

  const allMembers = nameSort
    ? [...allMembersUnsorted].sort((a, b) =>
        nameSort === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name)
      )
    : [...allMembersUnsorted].sort((a, b) => a.sortOrder - b.sortOrder);

  const cycleNameSort = () => {
    setNameSort((prev) => (prev === null ? "asc" : prev === "asc" ? "desc" : null));
  };

  const handleAssignmentChange = (
    memberId: string,
    currentTeamId: string | null,
    newTeamId: string
  ) => {
    if (newTeamId === "unassigned") {
      if (currentTeamId) unassignMember(memberId, currentTeamId);
    } else {
      assignMember(memberId, newTeamId);
    }
  };

  const [archiveMemberId, setArchiveMemberId] = useState<string | null>(null);

  const confirmArchiveMember = () => {
    if (!archiveMemberId) return;
    const member = allMembers.find((m) => m.id === archiveMemberId);
    archiveMember(archiveMemberId);
    toast({ title: "Member archived", description: `${member?.name} has been archived.` });
    setArchiveMemberId(null);
  };

  const [archivedMembersExpanded, setArchivedMembersExpanded] = useState(false);
  const [unarchiveMemberId, setUnarchiveMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (archivedMembersExpanded) loadArchivedMembers();
  }, [archivedMembersExpanded, loadArchivedMembers]);

  const confirmUnarchiveMember = async () => {
    if (!unarchiveMemberId) return;
    const member = archivedMembers.find((m) => m.id === unarchiveMemberId);
    await unarchiveMember(unarchiveMemberId);
    toast({
      title: "Member restored",
      description: `${member?.name} has been unarchived.`,
    });
    setUnarchiveMemberId(null);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <SettingsIcon className="h-8 w-8 text-primary" />
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            <span className="text-gradient-primary">Settings</span>
          </h1>
        </div>

        {/* Teams Section */}
        <div className="mb-8">
          <div className="mb-5 rounded-xl bg-secondary px-6 py-4 shadow-lg flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary">
              👥 Teams
            </h2>
            <Dialog open={createTeamOpen} onOpenChange={setCreateTeamOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-3.5 w-3.5" /> New Team
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="font-display text-foreground">Create Team</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <Input
                    placeholder="Team name"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateTeam()}
                    className="bg-secondary/20 border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <Input
                    placeholder="Owner (optional)"
                    value={newTeamOwner}
                    onChange={(e) => setNewTeamOwner(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateTeam()}
                    className="bg-secondary/20 border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Date</label>
                      <Input
                        type="date"
                        value={newTeamStartDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewTeamStartDate(val);
                          if (val) {
                            const year = new Date(val + "T00:00:00").getFullYear();
                            if (year >= 2000) {
                              setNewTeamEndDate(addMonths(val, 9));
                            }
                          } else {
                            setNewTeamEndDate("");
                          }
                        }}
                        className="bg-secondary/20 border-border text-foreground"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">End Date</label>
                      <Input
                        type="date"
                        value={newTeamEndDate}
                        onChange={(e) => setNewTeamEndDate(e.target.value)}
                        className="bg-secondary/20 border-border text-foreground"
                      />
                    </div>
                  </div>
                  <Button onClick={handleCreateTeam} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                    Create Team
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {teams.length === 0 ? (
            <div className="rounded-lg border border-border border-dashed bg-card/50 p-10 text-center glow-card">
              <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">No teams yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((team) => (
                <Card
                  key={team.id}
                  className={`border-border bg-card glow-card transition-all ${!team.isActive ? "opacity-50" : ""}`}
                  draggable
                  onDragStart={() => handleDragStart(team.id)}
                  onDragOver={(e) => handleDragOver(e, team.id)}
                  onDrop={handleDrop}
                  onDragEnd={() => { dragItem.current = null; dragOverItem.current = null; }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing shrink-0" />
                        <CardTitle className="font-display text-lg text-foreground">{team.name}</CardTitle>
                      </div>
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={team.isActive}
                          onCheckedChange={(checked) => toggleTeamActive(team.id, checked)}
                          className="scale-75"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => startEditTeam(team.id)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTeamId(team.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1 text-sm">
                      <p className="text-muted-foreground">
                        Owner: <span className="text-foreground font-medium">{team.owner || "—"}</span>
                      </p>
                      <p className="text-muted-foreground">
                        Lead Rep: <span className="text-foreground font-medium">{team.leadRep || "—"}</span>
                      </p>
                      <div className="flex items-center gap-1.5 pt-1">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span className="text-sm font-medium text-primary">{team.members.filter((m) => m.isActive).length} members</span>
                      </div>
                      {formatDateRange(team.startDate, team.endDate) && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            {formatDateRange(team.startDate, team.endDate)}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Dialog open={!!editTeamId} onOpenChange={(open) => { if (!open) { setEditTeamId(null); setSelectedEditMonth(null); } }}>
            <DialogContent className="bg-card border-border max-h-[85vh] max-w-5xl w-full flex flex-col overflow-hidden">
              <DialogHeader>
                <DialogTitle className="font-display text-foreground">Edit Team</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2 overflow-y-auto flex-1 min-h-0 pr-1">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Team Name</label>
                  <Input
                    value={editTeamName}
                    onChange={(e) => setEditTeamName(e.target.value)}
                    className="bg-secondary/20 border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Owner</label>
                  <Input
                    value={editTeamOwner}
                    onChange={(e) => setEditTeamOwner(e.target.value)}
                    className="bg-secondary/20 border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Lead Rep</label>
                  {(() => {
                    const editingTeam = teams.find((t) => t.id === editTeamId);
                    const teamMembers = editingTeam
                      ? [...editingTeam.members].sort((a, b) => a.name.localeCompare(b.name))
                      : [];
                    return (
                      <Select
                        value={editTeamLeadRep || "__none__"}
                        onValueChange={(val) => setEditTeamLeadRep(val === "__none__" ? "" : val)}
                      >
                        <SelectTrigger className="bg-secondary/20 border-border text-foreground">
                          <SelectValue placeholder="Select lead rep" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border z-50">
                          <SelectItem value="__none__">None</SelectItem>
                          {teamMembers.map((m) => (
                            <SelectItem key={m.id} value={m.name}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Date</label>
                    <Input
                      type="date"
                      value={editTeamStartDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditTeamStartDate(val);
                        if (val) {
                          const year = new Date(val + "T00:00:00").getFullYear();
                          if (year >= 2000) {
                            setEditTeamEndDate(addMonths(val, 9));
                          }
                        } else {
                          setEditTeamEndDate("");
                        }
                      }}
                      className="bg-secondary/20 border-border text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">End Date</label>
                    <Input
                      type="date"
                      value={editTeamEndDate}
                      onChange={(e) => setEditTeamEndDate(e.target.value)}
                      className="bg-secondary/20 border-border text-foreground"
                    />
                  </div>
                </div>

                {/* ── Test Phases Selector ── */}
                {(() => {
                  const phases = generateTestPhases(editTeamStartDate || null, editTeamEndDate || null, {});
                  if (phases.length === 0) return null;
                  const now = new Date();
                  const colors = ["hsl(24, 80%, 53%)", "hsl(210, 65%, 50%)", "hsl(30, 80%, 50%)", "hsl(160, 50%, 48%)", "hsl(280, 50%, 55%)", "hsl(45, 70%, 52%)"];
                  const colorClasses = ["text-primary", "text-accent", "text-primary", "text-accent", "text-primary", "text-accent"];

                  const handlePhaseClick = (phase: ComputedPhase) => {
                    const phaseIsCurrentMonth = phase.year === now.getFullYear() && phase.month === now.getMonth();
                    if (phaseIsCurrentMonth && !selectedEditMonth) return;
                    setSettingsPrevExpanded(false);
                    setSettingsNextExpanded(false);
                    const team = teams.find((t) => t.id === editTeamId);
                    if (phaseIsCurrentMonth) {
                      setSelectedEditMonth(null);
                      if (team) {
                        setEditTeamParity(team.goalsParity);
                        setEditTeamGoals({ ...team.teamGoals });
                        setEditEnabledGoals({ ...team.enabledGoals });
                        setEditAcceleratorConfig({ ...team.acceleratorConfig });
                        setEditTeamGoalsByLevel(JSON.parse(JSON.stringify(team.teamGoalsByLevel)));
                        setEditGoalScopeConfig({ ...DEFAULT_GOAL_SCOPE_CONFIG, ...team.goalScopeConfig });
                        const currentRoster = team.members.filter((m) => m.isActive).map((m) => m.id);
                        setEditTeamMembers(currentRoster);
                        setEditTeamMembersInitial(currentRoster);
                      }
                      return;
                    }
                    const d = phaseToDate(phase);
                    setSelectedEditMonth(d);
                    const monthKey = toMonthKey(d);
                    const entry = teamGoalsHistory.find((h) => h.teamId === editTeamId && h.month === monthKey);
                    if (entry) {
                      setEditTeamParity(entry.goalsParity);
                      setEditTeamGoals({ ...entry.teamGoals });
                      setEditEnabledGoals({ ...entry.enabledGoals });
                      setEditAcceleratorConfig({ ...entry.acceleratorConfig });
                      setEditTeamGoalsByLevel(JSON.parse(JSON.stringify(entry.teamGoalsByLevel)));
                      setEditGoalScopeConfig({ ...DEFAULT_GOAL_SCOPE_CONFIG, ...entry.goalScopeConfig });
                    } else if (team) {
                      setEditTeamParity(team.goalsParity);
                      setEditTeamGoals({ ...team.teamGoals });
                      setEditEnabledGoals({ ...team.enabledGoals });
                      setEditAcceleratorConfig({ ...team.acceleratorConfig });
                      setEditTeamGoalsByLevel(JSON.parse(JSON.stringify(team.teamGoalsByLevel)));
                      setEditGoalScopeConfig({ ...DEFAULT_GOAL_SCOPE_CONFIG, ...team.goalScopeConfig });
                    }
                    if (team) {
                      const histMembers = getTeamMembersForMonth(team, d, memberTeamHistory, allMembersById).map((m) => m.id);
                      setEditTeamMembers(histMembers);
                      setEditTeamMembersInitial(histMembers);
                    }
                  };

                  const { previousPhases: sPrev, visiblePhases: sVis, nextPhases: sNext } = splitPhases(phases, selectedEditMonth ?? undefined);
                  const hasPrev = sPrev.length > 0;
                  const hasNext = sNext.length > 0;
                  const segs: (ComputedPhase | { bucket: "previous" | "next"; count: number })[] = [];
                  if (hasPrev && !settingsPrevExpanded) {
                    segs.push({ bucket: "previous", count: sPrev.length });
                  } else if (hasPrev) {
                    segs.push(...sPrev);
                  }
                  segs.push(...sVis);
                  if (hasNext && !settingsNextExpanded) {
                    segs.push({ bucket: "next", count: sNext.length });
                  } else if (hasNext) {
                    segs.push(...sNext);
                  }
                  const gridTemplateCols = segs.map(s => "bucket" in s ? "auto" : "1fr").join(" ");

                  return (
                    <div className="rounded-md border border-border bg-secondary/10 p-3 space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">Test Phases</h4>
                      {selectedEditMonth && !isCurrentMonth(selectedEditMonth) && (
                        <div className="flex items-center justify-between rounded-md bg-primary/10 border border-primary/30 px-3 py-1.5">
                          <span className="text-xs font-medium text-primary">
                            Viewing: {selectedEditMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}
                          </span>
                          <button
                            type="button"
                            onClick={() => handlePhaseClick({ year: now.getFullYear(), month: now.getMonth() } as ComputedPhase)}
                            className="text-xs font-semibold text-primary hover:text-primary/80 underline"
                          >
                            Back to Current
                          </button>
                        </div>
                      )}
                      <div className="grid" style={{ gridTemplateColumns: gridTemplateCols }}>
                        <div className="rounded-full bg-muted h-5" style={{ gridRow: 1, gridColumn: '1 / -1' }} />
                        {segs.map((seg, i) => {
                          const isFirst = i === 0;
                          const isLast = i === segs.length - 1;
                          if ("bucket" in seg) {
                            return (
                              <div
                                key={`bar-${seg.bucket}`}
                                className="relative h-5 z-[1] cursor-pointer overflow-hidden hover:brightness-110"
                                style={{ gridRow: 1, gridColumn: i + 1, borderRadius: isFirst ? '9999px 0 0 9999px' : isLast ? '0 9999px 9999px 0' : '0' }}
                                onClick={() => seg.bucket === "previous" ? setSettingsPrevExpanded(true) : setSettingsNextExpanded(true)}
                              >
                                <div className="h-full w-full" style={{ backgroundColor: "hsl(var(--muted-foreground) / 0.3)" }} />
                                {!isLast && <div className="absolute right-0 top-0 h-full w-px bg-border z-[2]" />}
                              </div>
                            );
                          }
                          const phase = seg;
                          const phaseIsCurrentMonth = phase.year === now.getFullYear() && phase.month === now.getMonth();
                          const phaseIsSelected = selectedEditMonth
                            ? phase.year === selectedEditMonth.getFullYear() && phase.month === selectedEditMonth.getMonth()
                            : phaseIsCurrentMonth;
                          return (
                            <div
                              key={`bar-${phase.monthIndex}`}
                              className={`relative h-5 z-[1] cursor-pointer overflow-hidden transition-all ${phaseIsSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-background z-10 rounded-sm" : "hover:brightness-110"}`}
                              style={{ gridRow: 1, gridColumn: i + 1, ...(!phaseIsSelected ? { borderRadius: isFirst ? '9999px 0 0 9999px' : isLast ? '0 9999px 9999px 0' : '0' } : {}) }}
                              onClick={() => handlePhaseClick(phase)}
                            >
                              <div className="h-full transition-all duration-500 ease-out" style={{ width: `${phase.progress}%`, backgroundColor: colors[phase.monthIndex % colors.length] }} />
                              {!isLast && <div className="absolute right-0 top-0 h-full w-px bg-border z-[2]" />}
                            </div>
                          );
                        })}
                        {segs.map((seg, i) => {
                          if ("bucket" in seg) {
                            return (
                              <div
                                key={`label-${seg.bucket}`}
                                className="mt-2 text-center cursor-pointer rounded-md transition-colors py-0.5 hover:bg-muted/50 whitespace-nowrap"
                                style={{ gridRow: 2, gridColumn: i + 1 }}
                                onClick={() => seg.bucket === "previous" ? setSettingsPrevExpanded(true) : setSettingsNextExpanded(true)}
                              >
                                <p className="text-[10px] font-semibold text-muted-foreground">{seg.bucket === "previous" ? `Prev (${seg.count})` : `Next (${seg.count})`}</p>
                              </div>
                            );
                          }
                          const phase = seg;
                          const phaseIsCurrentMonth = phase.year === now.getFullYear() && phase.month === now.getMonth();
                          const phaseIsSelected = selectedEditMonth
                            ? phase.year === selectedEditMonth.getFullYear() && phase.month === selectedEditMonth.getMonth()
                            : phaseIsCurrentMonth;
                          return (
                            <div
                              key={`label-${phase.monthIndex}`}
                              className={`mt-2 text-center cursor-pointer rounded-md transition-colors px-0.5 py-0.5 ${phaseIsSelected ? "bg-primary/15" : "hover:bg-muted/50"}`}
                              style={{ gridRow: 2, gridColumn: i + 1 }}
                              onClick={() => handlePhaseClick(phase)}
                            >
                              <p className={`text-[10px] font-semibold ${phaseIsSelected ? "text-primary" : colorClasses[phase.monthIndex % colorClasses.length]}`}>
                                {phase.monthLabel}
                              </p>
                              <p className="text-[9px] text-muted-foreground">{(() => { const t = teams.find((t) => t.id === editTeamId); return t ? getPhaseWinsLabel([t], phase.year, phase.month) : "0"; })()}</p>
                            </div>
                          );
                        })}
                      </div>
                      {(settingsPrevExpanded || settingsNextExpanded) && (
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() => { setSettingsPrevExpanded(false); setSettingsNextExpanded(false); }}
                            className="text-[9px] font-medium text-muted-foreground hover:text-primary underline"
                          >
                            Collapse
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Team Members ── */}
                {(() => {
                  const roster = editTeamMembers
                    .map((id) => allMembersById.get(id))
                    .filter((m): m is NonNullable<typeof m> => m != null)
                    .sort((a, b) => a.name.localeCompare(b.name));

                  const availableMembers = Array.from(allMembersById.values())
                    .filter((m) => m.isActive && !editTeamMembers.includes(m.id))
                    .sort((a, b) => a.name.localeCompare(b.name));

                  return (
                    <div className="rounded-md border border-border bg-secondary/10 p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-foreground">Team Members</h4>
                          <Badge variant="secondary" className="text-[10px]">{roster.length}</Badge>
                        </div>
                        <Select
                          value="__add__"
                          onValueChange={(val) => {
                            if (val !== "__add__") {
                              setEditTeamMembers((prev) => [...prev, val]);
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 w-40 bg-background border-border/50 text-foreground text-xs">
                            <SelectValue placeholder="+ Add Member" />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border z-50">
                            <SelectItem value="__add__" disabled>+ Add Member</SelectItem>
                            {availableMembers.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}{m.level ? ` (${MEMBER_LEVEL_LABELS[m.level]})` : ""}
                              </SelectItem>
                            ))}
                            {availableMembers.length === 0 && (
                              <SelectItem value="__none__" disabled>No members available</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      {roster.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No members assigned for this period.</p>
                      ) : (
                        <div className="space-y-1">
                          {roster.map((m) => (
                            <div key={m.id} className="flex items-center justify-between rounded-md bg-background/50 px-2.5 py-1.5 border border-border/30">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-foreground">{m.name}</span>
                                {m.level && (
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                    {MEMBER_LEVEL_LABELS[m.level]}
                                  </Badge>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => setEditTeamMembers((prev) => prev.filter((id) => id !== m.id))}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                                title="Remove from team"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Monthly Goals ── */}
                <div className="rounded-md border border-border bg-secondary/10 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Monthly Goals</h4>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-muted-foreground">Parity</label>
                      <Switch
                        checked={editTeamParity}
                        onCheckedChange={setEditTeamParity}
                        className="scale-75"
                      />
                    </div>
                  </div>
                  <div className="flex">
                    {/* Sticky left: toggles + metric names + scope */}
                    <div className="shrink-0 border-r border-border/50">
                      <div className="h-7 flex items-center gap-1.5">
                        <span className="w-11 shrink-0" />
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-14">Metric</span>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Scope</span>
                      </div>
                      {GOAL_METRICS.map((metric) => (
                        <div key={metric} className="h-8 flex items-center gap-1.5 pr-2">
                          <Switch
                            checked={editEnabledGoals[metric]}
                            onCheckedChange={(checked) =>
                              setEditEnabledGoals((prev) => ({ ...prev, [metric]: checked }))
                            }
                            className="scale-[0.6] shrink-0"
                          />
                          <span className="text-[11px] font-medium text-foreground whitespace-nowrap w-14">
                            {GOAL_METRIC_LABELS[metric]}
                          </span>
                          {editEnabledGoals[metric] ? (
                            <button
                              type="button"
                              onClick={() =>
                                setEditGoalScopeConfig((prev) => ({
                                  ...prev,
                                  [metric]: prev[metric] === 'individual' ? 'team' : 'individual',
                                }))
                              }
                              className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 border transition-colors shrink-0 ${
                                editGoalScopeConfig[metric] === 'team'
                                  ? 'bg-primary/15 border-primary/40 text-primary'
                                  : 'bg-muted/50 border-border/50 text-muted-foreground'
                              }`}
                              title={editGoalScopeConfig[metric] === 'team' ? 'Team goal — sum of all members' : 'Self goal — per rep'}
                            >
                              {editGoalScopeConfig[metric] === 'team' ? 'TEAM' : 'SELF'}
                            </button>
                          ) : (
                            <span className="text-[9px] text-muted-foreground w-9">—</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Scrollable right: level columns */}
                    <div className="overflow-x-auto flex-1">
                      <div className="inline-flex flex-col min-w-max">
                        <div className="flex h-7">
                          {MEMBER_LEVELS.map((lvl) => (
                            <div key={lvl} className="w-16 text-center flex items-center justify-center">
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                {MEMBER_LEVEL_LABELS[lvl]}
                              </span>
                            </div>
                          ))}
                        </div>
                        {GOAL_METRICS.map((metric) => {
                          const enabled = editEnabledGoals[metric];
                          return (
                            <div key={metric} className="flex h-8">
                              {MEMBER_LEVELS.map((lvl) => (
                                <div key={lvl} className="w-16 flex items-center justify-center">
                                  {enabled ? (
                                    <Input
                                      type="number"
                                      min={0}
                                      value={editTeamGoalsByLevel[metric]?.[lvl] || ""}
                                      onChange={(e) => {
                                        const num = Math.max(0, parseInt(e.target.value) || 0);
                                        setEditTeamGoalsByLevel((prev) => ({
                                          ...prev,
                                          [metric]: { ...(prev[metric] || {}), [lvl]: num },
                                        }));
                                      }}
                                      className="h-6 w-14 bg-background border-border/50 text-foreground text-[10px] text-center p-0"
                                    />
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">—</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Accelerator ── */}
                {(() => {
                  const newRule = (): AcceleratorRule => ({
                    enabled: true,
                    conditionOperator: '>',
                    conditionValue1: 0,
                    conditionValue2: 0,
                    actionOperator: '+',
                    actionValue: 0,
                    actionUnit: '%',
                    scope: 'individual',
                  });

                  const getRules = (metric: GoalMetric): AcceleratorRule[] =>
                    editAcceleratorConfig[metric] ?? [];

                  const setRules = (metric: GoalMetric, rules: AcceleratorRule[]) => {
                    setEditAcceleratorConfig((prev) => ({ ...prev, [metric]: rules }));
                  };

                  const updateRule = (metric: GoalMetric, idx: number, updates: Partial<AcceleratorRule>) => {
                    const rules = [...getRules(metric)];
                    rules[idx] = { ...rules[idx], ...updates };
                    setRules(metric, rules);
                  };

                  const addRule = (metric: GoalMetric) => {
                    setRules(metric, [...getRules(metric), newRule()]);
                  };

                  const removeRule = (metric: GoalMetric, idx: number) => {
                    setRules(metric, getRules(metric).filter((_, i) => i !== idx));
                  };

                  return (
                    <div className="rounded-md border border-border bg-secondary/10 p-3 space-y-3">
                      <h4 className="text-sm font-semibold text-foreground">Accelerator</h4>
                      <div className="space-y-4">
                        {GOAL_METRICS.map((metric) => {
                          const rules = getRules(metric);
                          return (
                            <div key={metric} className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-foreground">
                                  {GOAL_METRIC_LABELS[metric]}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => addRule(metric)}
                                  className="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
                                >
                                  + Add Rule
                                </button>
                              </div>
                              {rules.map((rule, idx) => (
                                <div key={idx} className="ml-2 flex flex-wrap items-center gap-1.5 text-xs rounded-md bg-background/50 p-1.5 border border-border/30">
                                  <span className="font-semibold text-muted-foreground">IF</span>
                                  <span className="font-medium text-foreground">{GOAL_METRIC_LABELS[metric]}</span>
                                  <select
                                    value={rule.conditionOperator}
                                    onChange={(e) => updateRule(metric, idx, { conditionOperator: e.target.value as AcceleratorRule['conditionOperator'] })}
                                    className="h-6 rounded border border-border bg-background px-1 text-xs text-foreground"
                                  >
                                    <option value=">">&gt;</option>
                                    <option value="<">&lt;</option>
                                    <option value="between">between</option>
                                  </select>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={rule.conditionValue1 || ""}
                                    onChange={(e) => updateRule(metric, idx, { conditionValue1: Math.max(0, parseInt(e.target.value) || 0) })}
                                    className="h-6 w-14 bg-background border-border/50 text-foreground text-xs text-center p-0"
                                  />
                                  {rule.conditionOperator === 'between' && (
                                    <>
                                      <span className="text-muted-foreground">and</span>
                                      <Input
                                        type="number"
                                        min={0}
                                        value={rule.conditionValue2 || ""}
                                        onChange={(e) => updateRule(metric, idx, { conditionValue2: Math.max(0, parseInt(e.target.value) || 0) })}
                                        className="h-6 w-14 bg-background border-border/50 text-foreground text-xs text-center p-0"
                                      />
                                    </>
                                  )}
                                  <span className="font-semibold text-muted-foreground">THEN</span>
                                  <select
                                    value={rule.actionOperator}
                                    onChange={(e) => updateRule(metric, idx, { actionOperator: e.target.value as AcceleratorRule['actionOperator'] })}
                                    className="h-6 rounded border border-border bg-background px-1 text-xs text-foreground"
                                  >
                                    <option value="+">+</option>
                                    <option value="-">-</option>
                                    <option value="*">*</option>
                                  </select>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={rule.actionValue || ""}
                                    onChange={(e) => updateRule(metric, idx, { actionValue: Math.max(0, parseFloat(e.target.value) || 0) })}
                                    className="h-6 w-14 bg-background border-border/50 text-foreground text-xs text-center p-0"
                                  />
                                  <select
                                    value={rule.actionUnit}
                                    onChange={(e) => updateRule(metric, idx, { actionUnit: e.target.value as AcceleratorRule['actionUnit'] })}
                                    className="h-6 rounded border border-border bg-background px-1 text-xs text-foreground"
                                  >
                                    <option value="%">%</option>
                                    <option value="#">#</option>
                                  </select>
                                  <span className="text-muted-foreground font-medium">to Quota</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateRule(metric, idx, {
                                        scope: (rule.scope ?? 'individual') === 'individual' ? 'team' : 'individual',
                                      })
                                    }
                                    className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 border transition-colors shrink-0 ${
                                      (rule.scope ?? 'individual') === 'team'
                                        ? 'bg-primary/15 border-primary/40 text-primary'
                                        : 'bg-muted/50 border-border/50 text-muted-foreground'
                                    }`}
                                    title={(rule.scope ?? 'individual') === 'team' ? 'Evaluates against team total' : 'Evaluates against individual rep'}
                                  >
                                    {(rule.scope ?? 'individual') === 'team' ? 'TEAM' : 'SELF'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeRule(metric, idx)}
                                    className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                                    title="Remove rule"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                              {rules.length === 0 && (
                                <p className="ml-2 text-[10px] text-muted-foreground italic">No rules. Click "+ Add Rule" to create one.</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground italic">
                        Rules stack — all matching rules for a metric are applied in order to the Quota.
                      </p>
                    </div>
                  );
                })()}

              </div>
              <div className="shrink-0 border-t border-border pt-3">
                <Button onClick={saveEditTeam} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                  Save Changes
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <AlertDialog open={!!deleteTeamId} onOpenChange={(open) => !open && setDeleteTeamId(null)}>
            <AlertDialogContent className="bg-card border-border">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display text-foreground">Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will archive{" "}
                  <span className="font-semibold text-foreground">
                    {teams.find((t) => t.id === deleteTeamId)?.name}
                  </span>
                  . Members will be moved to unassigned.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>No</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmDeleteTeam}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Yes
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Ended Tests Section */}
        {endedTeams.length > 0 && (
          <div className="mb-4 mt-4">
            <button
              onClick={() => setEndedExpanded((v) => !v)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {endedExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-medium">Ended Tests</span>
            </button>

            {endedExpanded && (
              <div className="mt-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {endedTeams.map((team) => (
                    <Card key={team.id} className="border-border bg-card/50 opacity-70">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="font-display text-base text-foreground">{team.name}</CardTitle>
                          <div className="flex items-center gap-1">
                            <Switch
                              checked={team.isActive}
                              onCheckedChange={(checked) => toggleTeamActive(team.id, checked)}
                              className="scale-75"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteTeamId(team.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-0.5 text-sm">
                          <p className="text-muted-foreground">
                            Owner: <span className="text-foreground font-medium">{team.owner || "—"}</span>
                          </p>
                          {formatDateRange(team.startDate, team.endDate) && (
                            <div className="flex items-center gap-1.5 pt-1">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">
                                {formatDateRange(team.startDate, team.endDate)}
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Archived Teams Section */}
        <div className="mb-8 mt-4">
          <button
            onClick={() => setArchivedExpanded((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {archivedExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-medium">Archived Teams</span>
          </button>

          {archivedExpanded && (
            <div className="mt-3">
              {archivedTeams.length === 0 ? (
                <p className="text-sm text-muted-foreground pl-6">No archived teams.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {archivedTeams.map((team) => (
                    <Card key={team.id} className="border-border bg-card/50 opacity-70">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="font-display text-base text-foreground">{team.name}</CardTitle>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-primary"
                            onClick={() => setUnarchiveTeamId(team.id)}
                          >
                            <ArchiveRestore className="h-3.5 w-3.5" />
                            Restore
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-0.5 text-sm">
                          <p className="text-muted-foreground">
                            Owner: <span className="text-foreground font-medium">{team.owner || "—"}</span>
                          </p>
                          <p className="text-muted-foreground text-xs">
                            Archived {new Date(team.archivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          <AlertDialog open={!!unarchiveTeamId} onOpenChange={(open) => !open && setUnarchiveTeamId(null)}>
            <AlertDialogContent className="bg-card border-border">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display text-foreground">Restore team?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will unarchive{" "}
                  <span className="font-semibold text-foreground">
                    {archivedTeams.find((t) => t.id === unarchiveTeamId)?.name}
                  </span>
                  . The team will be restored with no members — you can reassign members afterwards.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmUnarchiveTeam}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Restore
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <Separator className="my-8" />

        {/* Members Section */}
        <div>
          <div className="mb-5 rounded-xl bg-secondary px-6 py-4 shadow-lg flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary">
              🧑‍💼 Members
            </h2>
            <Dialog open={createMemberOpen} onOpenChange={setCreateMemberOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
                  <UserPlus className="h-3.5 w-3.5" /> New Member
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="font-display text-foreground">Create Member</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <Input
                    placeholder="Name"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateMember()}
                    className="bg-secondary/20 border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <Button onClick={handleCreateMember} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                    Create Member
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {allMembers.length === 0 ? (
            <div className="rounded-lg border border-border border-dashed bg-card/50 p-10 text-center glow-card">
              <UserPlus className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="mb-2 text-muted-foreground">No members yet</p>
              <p className="text-sm text-muted-foreground">Create members and assign them to teams.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card glow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="w-8 py-3 px-2" />
                    <th
                      className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={cycleNameSort}
                    >
                      <span className="inline-flex items-center gap-1">
                        Name
                        {nameSort === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : nameSort === "desc" ? (
                          <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </span>
                    </th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Level
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Team
                    </th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allMembers.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                      draggable
                      onDragStart={() => handleMemberDragStart(m.id)}
                      onDragOver={(e) => handleMemberDragOver(e, m.id)}
                      onDrop={handleMemberDrop}
                      onDragEnd={() => { dragMember.current = null; dragOverMember.current = null; }}
                    >
                      <td className="py-3 px-2 w-8">
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                      </td>
                      <td className="py-3 px-4 font-medium text-foreground">
                        {editingMemberId === m.id && editingField === "name" ? (
                          <div className="flex items-center gap-1">
                            <Input
                              ref={inlineInputRef}
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveInlineEdit();
                                if (e.key === "Escape") cancelInlineEdit();
                              }}
                              onBlur={saveInlineEdit}
                              className="h-7 w-40 text-sm bg-background border-border/50"
                            />
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-2 cursor-pointer group/name rounded px-1 -mx-1 hover:bg-muted/50 transition-colors"
                            onClick={() => startInlineEdit(m.id, "name", m.name)}
                            title="Click to edit"
                          >
                            {m.name}
                            <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />
                            {!m.teamId && (
                              <Badge variant="secondary" className="text-[10px]">
                                Unassigned
                              </Badge>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Select
                          value={m.level || "__none__"}
                          onValueChange={(val) =>
                            updateMember(m.id, { level: val === "__none__" ? null : (val as MemberLevel) })
                          }
                        >
                          <SelectTrigger className="h-7 w-28 bg-background border-border/50 text-foreground text-xs mx-auto">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border z-50">
                            <SelectItem value="__none__">—</SelectItem>
                            {MEMBER_LEVELS.map((lvl) => (
                              <SelectItem key={lvl} value={lvl}>
                                {MEMBER_LEVEL_LABELS[lvl]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-3 px-4">
                        <Select
                          value={m.teamId || "unassigned"}
                          onValueChange={(val) => handleAssignmentChange(m.id, m.teamId, val)}
                        >
                          <SelectTrigger className="h-8 w-44 bg-background border-border/50 text-foreground text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border z-50">
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {teams.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-amber-500"
                          onClick={() => setArchiveMemberId(m.id)}
                          title="Archive member"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <AlertDialog open={!!archiveMemberId} onOpenChange={(open) => !open && setArchiveMemberId(null)}>
            <AlertDialogContent className="bg-card border-border">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display text-foreground">Archive member?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will archive{" "}
                  <span className="font-semibold text-foreground">
                    {allMembers.find((m) => m.id === archiveMemberId)?.name}
                  </span>
                  . They will be removed from their team and hidden from active views. You can restore them at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmArchiveMember}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Archive
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Archived Members Section */}
        <div className="mb-8 mt-4">
          <button
            onClick={() => setArchivedMembersExpanded((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {archivedMembersExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-medium">Archived Members</span>
          </button>

          {archivedMembersExpanded && (
            <div className="mt-3">
              {archivedMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground pl-6">No archived members.</p>
              ) : (
                <div className="rounded-lg border border-border bg-card/50 opacity-70 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Level</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Archived</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedMembers.map((m) => (
                        <tr key={m.id} className="border-b border-border/50 last:border-0">
                          <td className="py-3 px-4 font-medium text-foreground">{m.name}</td>
                          <td className="py-3 px-4 text-center text-muted-foreground text-xs">
                            {m.level ? MEMBER_LEVEL_LABELS[m.level] : "—"}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground text-xs">
                            {new Date(m.archivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-primary"
                              onClick={() => setUnarchiveMemberId(m.id)}
                            >
                              <ArchiveRestore className="h-3.5 w-3.5" />
                              Restore
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <AlertDialog open={!!unarchiveMemberId} onOpenChange={(open) => !open && setUnarchiveMemberId(null)}>
            <AlertDialogContent className="bg-card border-border">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display text-foreground">Restore member?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will unarchive{" "}
                  <span className="font-semibold text-foreground">
                    {archivedMembers.find((m) => m.id === unarchiveMemberId)?.name}
                  </span>
                  . They will be added to the unassigned pool — you can assign them to a team afterwards.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmUnarchiveMember}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Restore
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
};

export default Settings;
