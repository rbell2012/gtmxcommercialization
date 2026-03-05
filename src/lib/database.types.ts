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
  team_goal_wins: number;
  team_goal_feedback: number;
  team_goal_activity: number;
  goal_enabled_calls: boolean;
  goal_enabled_ops: boolean;
  goal_enabled_demos: boolean;
  goal_enabled_wins: boolean;
  goal_enabled_feedback: boolean;
  goal_enabled_activity: boolean;
  accelerator_config: Record<string, unknown>;
  team_goals_by_level: Record<string, unknown>;
  goal_scope_config: Record<string, unknown> | null;
  mission_purpose: string;
  mission_submitted: boolean;
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
  goal_wins: number;
  goal_feedback: number;
  goal_activity: number;
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
  activity: number;
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
  salesforce_accountid: string | null;
  account_name: string | null;
  rep_name: string;
  total_activities: number;
  first_activity_date: string | null;
  last_activity_date: string | null;
  total_calls: number;
  first_call_date: string | null;
  last_call_date: string | null;
  total_connects: number;
  first_connect_date: string | null;
  chorus_link: string | null;
  chorus_date: string | null;
  total_demos: number;
  first_demo_date: string | null;
  op_name: string | null;
  op_date: string | null;
  op_stage: string | null;
  is_won: boolean;
  win_date: string | null;
  feedback: string | null;
  feedback_date: string | null;
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

export interface DbMetricsDemos {
  id: string;
  demo_date: string | null;
  demo_source: string | null;
  salesforce_accountid: string | null;
  rep_name: string;
  account_name: string | null;
  subject: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMetricsOps {
  id: string;
  op_date: string | null;
  opportunity_name: string | null;
  opportunity_stage: string | null;
  salesforce_accountid: string | null;
  rep_name: string;
  gtmx_team: string | null;
  account_prospecting_notes: string | null;
  opportunity_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMetricsWins {
  id: string;
  win_date: string | null;
  account_name: string | null;
  salesforce_accountid: string | null;
  rep_name: string;
  opportunity_name: string | null;
  opportunity_stage: string | null;
  gtmx_team: string | null;
  account_prospecting_notes: string | null;
  opportunity_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMemberTeamHistory {
  id: string;
  member_id: string;
  team_id: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface DbTeamGoalsHistory {
  id: string;
  team_id: string;
  month: string;
  goals_parity: boolean;
  team_goals: Record<string, unknown>;
  enabled_goals: Record<string, unknown>;
  accelerator_config: Record<string, unknown>;
  team_goals_by_level: Record<string, unknown>;
  goal_scope_config: Record<string, unknown>;
  created_at: string;
}

export interface DbMemberGoalsHistory {
  id: string;
  member_id: string;
  month: string;
  goals: Record<string, unknown>;
  level: string | null;
  created_at: string;
}

export interface DbMetricsFeedback {
  id: string;
  feedback_date: string | null;
  rep_name: string;
  account_name: string | null;
  source: string | null;
  feedback: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMetricsActivity {
  id: string;
  activity_date: string | null;
  salesforce_accountid: string | null;
  rep_name: string;
  activity_type: string | null;
  subject: string | null;
  status: string | null;
  activity_outcome: string | null;
  activity_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMetricsCalls {
  id: string;
  call_date: string | null;
  salesforce_accountid: string | null;
  rep_name: string;
  call_type: string | null;
  subject: string | null;
  status: string | null;
  call_outcome: string | null;
  call_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMetricsConnects {
  id: string;
  connect_date: string | null;
  salesforce_accountid: string | null;
  rep_name: string;
  connect_type: string | null;
  subject: string | null;
  status: string | null;
  connect_outcome: string | null;
  connect_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMetricsChorus {
  id: string;
  account_name: string | null;
  salesforce_accountid: string | null;
  comments: string | null;
  chorus_link: string | null;
  rep_name: string;
  chorus_date: string | null;
  rn: number | null;
  created_at: string;
  updated_at: string;
}

export interface DbRevxImpactValue {
  id: string;
  team_id: string;
  value_per_win: number;
  created_at: string;
  updated_at: string;
}

export interface DbFunnelEditLog {
  id: string;
  member_id: string;
  week_key: string;
  edited_by: string;
  edited_at: string;
}

export interface DbAuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_at: string;
}
