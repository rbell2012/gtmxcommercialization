/** Allowed values for the first line (phase label) in Test Phases — dropdown only. */
export const PHASE_LABEL_OPTIONS = [
  "Ramp",
  "Run",
  "Recommendations",
  "Pilot",
  "Commercial Lead",
] as const;

export type PhaseLabelOption = (typeof PHASE_LABEL_OPTIONS)[number];

export function isAllowedPhaseLabel(value: string): value is PhaseLabelOption {
  return (PHASE_LABEL_OPTIONS as readonly string[]).includes(value);
}

export interface ComputedPhase {
  monthIndex: number;
  monthLabel: string;
  progress: number;
  label: string;
  priority: string;
  year: number;
  month: number; // 0-indexed JS month
}

export function generateTestPhases(
  startDate: string | null,
  endDate: string | null,
  labels: Record<number, string>,
  priorities: Record<number, string> = {}
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
      priority: priorities[index] ?? "",
      year,
      month,
    });

    cursor.setMonth(cursor.getMonth() + 1);
    index++;
  }

  return phases;
}

export interface SplitPhases {
  previousPhases: ComputedPhase[];
  visiblePhases: ComputedPhase[];
  nextPhases: ComputedPhase[];
}

export function splitPhases(phases: ComputedPhase[], anchorDate?: Date): SplitPhases {
  const anchor = anchorDate ?? new Date();
  const anchorYear = anchor.getFullYear();
  const anchorMonth = anchor.getMonth();

  const cutoffDate = new Date(anchorYear, anchorMonth - 2, 1);
  const cutoffYear = cutoffDate.getFullYear();
  const cutoffMonth = cutoffDate.getMonth();

  const previousPhases: ComputedPhase[] = [];
  const visiblePhases: ComputedPhase[] = [];
  const nextPhases: ComputedPhase[] = [];

  for (const phase of phases) {
    if (phase.year < cutoffYear || (phase.year === cutoffYear && phase.month < cutoffMonth)) {
      previousPhases.push(phase);
    } else if (phase.year > anchorYear || (phase.year === anchorYear && phase.month > anchorMonth)) {
      nextPhases.push(phase);
    } else {
      visiblePhases.push(phase);
    }
  }

  return { previousPhases, visiblePhases, nextPhases };
}

export function isCurrentMonth(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export function phaseToDate(phase: ComputedPhase): Date {
  return new Date(phase.year, phase.month, 15);
}
