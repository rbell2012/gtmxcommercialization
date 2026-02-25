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
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMember {
  id: string;
  team_id: string | null;
  name: string;
  goal: number;
  ducks_earned: number;
  is_active: boolean;
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
  demos: number;
  wins: number;
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
