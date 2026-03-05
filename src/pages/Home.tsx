import { useNavigate } from "react-router-dom";
import {
  Home as HomeIcon,
  Users,
  Calendar,
  Handshake,
  Video,
  TrendingUp,
  MessageCircle,
  Activity,
  Trophy,
  BarChart3,
  Target,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useTeams,
  pilotNameToSlug,
  type Team,
  type TeamMember,
  type GoalMetric,
} from "@/contexts/TeamsContext";
import { getMemberLifetimeMetricTotal } from "@/lib/quota-helpers";

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

function computeOverallProgress(startDate: string | null, endDate: string | null): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate + "T00:00:00").getTime();
  const end = new Date(endDate + "T00:00:00").getTime();
  const today = new Date().setHours(0, 0, 0, 0);
  if (today <= start) return 0;
  if (today >= end) return 100;
  return Math.round(((today - start) / (end - start)) * 100);
}

function getTestBusinessDaysRemaining(endDate: string | null): number {
  if (!endDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate + "T00:00:00");
  if (end <= today) return 0;
  let count = 0;
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function getMemberLifetimeWins(m: TeamMember): number {
  return Object.values(m.funnelByWeek || {}).reduce((s, f) => s + f.wins, 0);
}

function getMemberLifetimeFunnelTotal(m: TeamMember, field: "calls" | "connects" | "demos" | "wins"): number {
  return Object.values(m.funnelByWeek || {}).reduce((s, f) => s + (f[field] || 0), 0);
}

function fmtNum(v: number): string {
  return v.toLocaleString();
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card/80 px-3 py-2">
      {icon}
      <div>
        <p className="text-[10px] text-muted-foreground leading-none">{label}</p>
        <p className="font-display text-base font-bold text-foreground leading-tight">{fmtNum(value)}</p>
      </div>
    </div>
  );
}

function ProjectCard({ team, index }: { team: Team; index: number }) {
  const navigate = useNavigate();
  const members = team.members.filter((m) => m.isActive);
  const progress = computeOverallProgress(team.startDate, team.endDate);
  const dateRange = formatDateRange(team.startDate, team.endDate);

  const lifetimeOps = members.reduce((s, m) => s + getMemberLifetimeMetricTotal(m, "ops"), 0);
  const lifetimeDemos = members.reduce((s, m) => s + getMemberLifetimeMetricTotal(m, "demos"), 0);
  const lifetimeWins = members.reduce((s, m) => s + getMemberLifetimeWins(m), 0);
  const lifetimeFeedback = members.reduce((s, m) => s + getMemberLifetimeMetricTotal(m, "feedback"), 0);
  const lifetimeActivity = members.reduce((s, m) => s + getMemberLifetimeMetricTotal(m, "activity"), 0);

  const slug = pilotNameToSlug(team.name);
  const path = index === 0 ? "/Pilots" : `/Pilots/${slug}`;

  return (
    <Card
      className="border-border bg-card glow-card cursor-pointer transition-all hover:border-primary/40 hover:shadow-lg group"
      onClick={() => navigate(path)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <CardTitle className="font-display text-xl text-foreground group-hover:text-primary transition-colors shrink-0">
              {team.name}
            </CardTitle>
            <span className="text-sm text-muted-foreground">
              Owner: <span className="text-foreground font-medium">{team.owner || "—"}</span>
            </span>
            <span className="text-sm text-muted-foreground">
              Lead Rep: <span className="text-foreground font-medium">{team.leadRep || "—"}</span>
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-medium text-primary">{members.length} members</span>
            </div>
            {dateRange && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{dateRange}</span>
              </div>
            )}
            {team.startDate && team.endDate && (() => {
              const bizDaysLeft = getTestBusinessDaysRemaining(team.endDate);
              return (
                <div className="flex flex-1 items-center gap-2 min-w-0">
                  <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {bizDaysLeft > 0
                      ? <span className="font-semibold text-foreground">{bizDaysLeft} business day{bizDaysLeft !== 1 ? "s" : ""} left</span>
                      : <span className="font-semibold text-foreground">Complete</span>}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Trophy className="h-3.5 w-3.5 text-accent" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-accent">Lifetime Stats</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <StatChip icon={<Handshake className="h-4 w-4 text-accent" />} label="Ops" value={lifetimeOps} />
            <StatChip icon={<Video className="h-4 w-4 text-primary" />} label="Demos" value={lifetimeDemos} />
            <StatChip icon={<TrendingUp className="h-4 w-4 text-accent" />} label="Wins" value={lifetimeWins} />
            <StatChip icon={<MessageCircle className="h-4 w-4 text-primary" />} label="Feedback" value={lifetimeFeedback} />
            <StatChip icon={<Activity className="h-4 w-4 text-accent" />} label="Activity" value={lifetimeActivity} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PageOverviewCard({
  title,
  icon,
  description,
  bullets,
  onClick,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  bullets: string[];
  onClick: () => void;
}) {
  return (
    <Card
      className="border-border bg-card glow-card cursor-pointer transition-all hover:border-primary/40 hover:shadow-lg group"
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">{icon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-display text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                {title}
              </h3>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-sm text-muted-foreground mb-2">{description}</p>
            <ul className="space-y-1">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="mt-1 h-1 w-1 rounded-full bg-primary shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const Home = () => {
  const { teams, loading } = useTeams();
  const navigate = useNavigate();
  const activeTeams = teams.filter((t) => t.isActive);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center gap-3">
          <HomeIcon className="h-8 w-8 text-primary" />
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            <span className="text-gradient-primary">Home</span>
          </h1>
        </div>

        {/* Active Projects */}
        <section className="mb-10">
          <div className="mb-5 rounded-xl bg-secondary px-6 py-4 shadow-lg">
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary">
              Active Projects
            </h2>
            <p className="text-sm text-white mt-1">
              Click any project to view its full dashboard
            </p>
          </div>

          {activeTeams.length === 0 ? (
            <div className="rounded-lg border border-border border-dashed bg-card/50 p-10 text-center glow-card">
              <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">No active projects yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create teams in Settings to get started.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {activeTeams.map((team, i) => (
                <ProjectCard key={team.id} team={team} index={i} />
              ))}
            </div>
          )}
        </section>

        {/* Page Overviews */}
        <section>
          <div className="mb-5 rounded-xl bg-secondary px-6 py-4 shadow-lg">
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary">
              Explore
            </h2>
            <p className="text-sm text-white mt-1">
              Quick overview of what each section offers
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="border-border bg-card glow-card">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-lg font-bold text-foreground mb-1">
                      Project Pages
                    </h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      Full project dashboard with weekly tracking and performance data.
                    </p>
                    <ul className="space-y-1">
                      {[
                        "Weekly funnel submissions per rep",
                        "Monthly & lifetime stat tracking",
                        "Goal progress against quota",
                        "Win log and activity trends",
                        "Team performance charts",
                      ].map((b, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="mt-1 h-1 w-1 rounded-full bg-primary shrink-0" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <PageOverviewCard
              title="Data & Findings"
              icon={<BarChart3 className="h-5 w-5 text-primary" />}
              description="Cross-project analytics, account-level insights, and deal cycle metrics."
              bullets={[
                "Account breakdown by rep and team",
                "Deal cycle averages (call → connect → demo → win)",
                "Activity and engagement metrics per account",
                "Revenue impact values and comparisons",
                "Filterable data exports",
              ]}
              onClick={() => navigate("/data")}
            />

            <PageOverviewCard
              title="Quota"
              icon={<Target className="h-5 w-5 text-primary" />}
              description="Monthly quota tracking with accelerator support across all projects."
              bullets={[
                "Per-rep quota attainment breakdown",
                "Goal vs. actual for every metric",
                "Accelerator rule impact analysis",
                "Month-over-month phase navigation",
                "Team-scoped and individual-scoped views",
              ]}
              onClick={() => navigate("/quota")}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

export default Home;
