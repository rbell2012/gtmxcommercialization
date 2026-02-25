import { useState, useRef } from "react";
import { Settings as SettingsIcon, Plus, Users, Trash2, Edit2, UserPlus, ArrowUpDown, ArrowUp, ArrowDown, Calendar, GripVertical } from "lucide-react";
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
import { useTeams } from "@/contexts/TeamsContext";
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
    toggleTeamActive,
    createMember,
    assignMember,
    unassignMember,
    removeMember,
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

  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamOwner, setNewTeamOwner] = useState("");
  const [newTeamStartDate, setNewTeamStartDate] = useState("");
  const [newTeamEndDate, setNewTeamEndDate] = useState("");

  const [createMemberOpen, setCreateMemberOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberGoal, setNewMemberGoal] = useState("");

  const [editTeamId, setEditTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamOwner, setEditTeamOwner] = useState("");
  const [editTeamLeadRep, setEditTeamLeadRep] = useState("");
  const [editTeamStartDate, setEditTeamStartDate] = useState("");
  const [editTeamEndDate, setEditTeamEndDate] = useState("");

  const [deleteTeamId, setDeleteTeamId] = useState<string | null>(null);

  const [nameSort, setNameSort] = useState<"asc" | "desc" | null>(null);

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
    createMember(newMemberName.trim(), parseInt(newMemberGoal) || 30);
    toast({ title: "Member created", description: `${newMemberName.trim()} is ready to be assigned to a team.` });
    setNewMemberName("");
    setNewMemberGoal("");
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
  };

  const saveEditTeam = () => {
    if (!editTeamId || !editTeamName.trim()) return;
    updateTeam(editTeamId, (t) => ({
      ...t,
      name: editTeamName.trim(),
      owner: editTeamOwner.trim(),
      leadRep: editTeamLeadRep.trim(),
      startDate: editTeamStartDate || null,
      endDate: editTeamEndDate || null,
    }));
    toast({ title: "Team updated" });
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
    : allMembersUnsorted;

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

  const handleDeleteMember = (memberId: string) => {
    const member = allMembers.find((m) => m.id === memberId);
    removeMember(memberId);
    toast({ title: "Member removed", description: `${member?.name} has been removed.` });
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
                          setNewTeamStartDate(e.target.value);
                          if (e.target.value && !newTeamEndDate) {
                            setNewTeamEndDate(addMonths(e.target.value, 9));
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

          <Dialog open={!!editTeamId} onOpenChange={(open) => !open && setEditTeamId(null)}>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-display text-foreground">Edit Team</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
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
                        setEditTeamStartDate(e.target.value);
                        if (e.target.value && !editTeamEndDate) {
                          setEditTeamEndDate(addMonths(e.target.value, 9));
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
                  <Input
                    placeholder="Win goal (default: 30)"
                    type="number"
                    value={newMemberGoal}
                    onChange={(e) => setNewMemberGoal(e.target.value)}
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
                      Goal
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
                    >
                      <td className="py-3 px-4 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          {m.name}
                          {!m.teamId && (
                            <Badge variant="secondary" className="text-[10px]">
                              Unassigned
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center text-foreground tabular-nums">{m.goal}</td>
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
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteMember(m.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
