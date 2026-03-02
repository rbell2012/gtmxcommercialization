export interface DbTeam {
  id: string;
  name: string;
  owner: string;
  lead_rep: string;
  sort_order: number;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  total_tam: number;
  tam_submitted: boolean;
  goals_parity: boolean;
  team_goal_calls: number;
  team_goal_ops: number;
  team_goal_demos: number;
  team_goal_feedback: number;
  goal_enabled_calls: boolean;
  goal_enabled_ops: boolean;
  goal_enabled_demos: boolean;
  goal_enabled_feedback: boolean;
  accelerator_config: Record<string, unknown>;
  team_goals_by_level: Record<string, unknown>;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMember {
  id: string;
  team_id: string | null;
  name: string;
  goal_calls: number;
  goal_ops: number;
  goal_demos: number;
  goal_feedback: number;
  ducks_earned: number;
  is_active: boolean;
  level: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbWeeklyFunnel {
  id: string;
  member_id: string;
  week_key: string;
  role: string | null;
  tam: number;
  calls: number;
  connects: number;
  ops: number;
  demos: number;
  wins: number;
  feedback: number;
  submitted: boolean;
  submitted_at: string | null;
}

export interface DbWinEntry {
  id: string;
  member_id: string;
  restaurant: string;
  story: string | null;
  date: string;
  created_at: string;
}

export interface DbTestPhase {
  id: string;
  month: string;
  label: string;
  progress: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbMission {
  id: string;
  content: string;
  submitted: boolean;
  updated_at: string;
}

export interface DbTamConfig {
  id: string;
  total_tam: number;
  submitted: boolean;
  updated_at: string;
}

export interface DbCustomRole {
  id: string;
  name: string;
  created_at: string;
}

export interface DbTeamPhaseLabel {
  id: string;
  team_id: string;
  month_index: number;
  label: string;
  created_at: string;
  updated_at: string;
}

export interface DbSuperhex {
  id: string;
  rep_name: string;
  activity_week: string;
  total_activity_count: number;
  calls_count: number;
  connects_count: number;
  total_demos: number;
  total_wins: number;
  created_at: string;
  updated_at: string;
}

export interface DbMetricsTam {
  id: string;
  source: string;
  rep_name: string;
  tam: number;
  created_at: string;
  updated_at: string;
}

export interface DbMetricsTouchedAccounts {
  id: string;
  source: string;
  rep_name: string;
  touched_accounts: number;
  tam: number;
  touch_rate: number;
  created_at: string;
  updated_at: string;
}

export interface DbMetricsDemos {
  id: string;
  activity_week: string;
  rep_name: string;
  demos: number;
  created_at: string;
  updated_at: string;
}

export interface DbMetricsOps {
  id: string;
  opportunity_close_week: string;
  opportunity_name: string;
  full_name: string;
  gtmx_team: string;
  opportunity_iswon: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbMetricsWins {
  id: string;
  activity_week: string;
  date_added: string;
  rep_name: string;
  name: string;
  gtmx_team: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface DbMetricsFeedback {
  id: string;
  activity_week: string;
  date_added: string;
  rep_name: string;
  source: string;
  feedback_completed: number;
  chorus_comments: string;
  created_at: string;
  updated_at: string;
}
