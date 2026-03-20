import { useMemo } from "react";
import type { GoalMetric, AcceleratorRule, Team, TeamMember } from "@/contexts/TeamsContext";
import { GOAL_METRIC_LABELS } from "@/contexts/TeamsContext";

function formatCondition(rule: AcceleratorRule): string {
  if (rule.conditionOperator === "between") {
    return `between ${rule.conditionValue1} and ${rule.conditionValue2 ?? rule.conditionValue1}`;
  }
  return `${rule.conditionOperator} ${rule.conditionValue1}`;
}

function formatAction(rule: AcceleratorRule): string {
  const unit = rule.actionUnit === "%" ? "%" : "";
  return `${rule.actionOperator}${rule.actionValue}${unit} to quota`;
}

export function AcceleratorConfigTooltip({
  team,
  metric,
  rosterMembers,
}: {
  team: Team;
  metric: GoalMetric;
  rosterMembers: TeamMember[];
}) {
  const label = GOAL_METRIC_LABELS[metric];
  const mode = team.acceleratorMode ?? "basic";

  const memberNameById = useMemo(() => {
    return new Map(rosterMembers.map((m) => [m.id, m.name] as const));
  }, [rosterMembers]);

  // Exclusions are persisted on `basicAcceleratorConfig` so they apply to both modes.
  const excludedIds = team.basicAcceleratorConfig?.[metric]?.excludedMembers ?? [];
  const excludedNames = excludedIds.map((id) => memberNameById.get(id) ?? id);

  const renderScopeBadge = (scope?: string) => {
    const normalizedScope = scope === "team" ? "team" : "individual";
    return (
      <span
        className={`text-[8px] font-bold uppercase tracking-wider rounded px-1 py-px border ${
          normalizedScope === "team"
            ? "bg-primary/15 border-primary/40 text-primary"
            : "bg-muted/50 border-border/50 text-muted-foreground"
        }`}
      >
        {normalizedScope === "team" ? "TEAM" : "SELF"}
      </span>
    );
  };

  if (mode === "basic") {
    const cfg = team.basicAcceleratorConfig?.[metric];
    const scope = cfg?.scope ?? "individual";
    const minValue = cfg?.minValue ?? 0;
    const minPct = cfg?.minPct ?? 0;
    const maxValue = cfg?.maxValue ?? 0;

    return (
      <div className="text-xs leading-relaxed">
        <div className="flex items-center gap-1.5 mb-1">
          <p className="font-semibold">{label} Accelerator</p>
          {renderScopeBadge(scope)}
        </div>
        <p className="text-muted-foreground">
          Linearly scales from{" "}
          <span className="font-semibold text-foreground">{minPct}%</span> at{" "}
          <span className="font-semibold text-foreground">{minValue}</span> to{" "}
          <span className="font-semibold text-foreground">200%</span> at{" "}
          <span className="font-semibold text-foreground">{maxValue}</span>, added to quota.
        </p>
        {excludedNames.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] font-medium text-muted-foreground">Excluded members</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {excludedNames.map((name) => (
                <span
                  key={name}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-border/60 bg-muted/20"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const rules = (team.acceleratorConfig?.[metric] ?? []).filter((r) => r?.enabled);

  return (
    <div className="text-xs leading-relaxed">
      <div className="flex items-center gap-1.5 mb-1">
        <p className="font-semibold">{label} Accelerator</p>
        <span className="text-[8px] font-bold uppercase tracking-wider rounded px-1 py-px border bg-muted/50 border-border/50 text-muted-foreground">
          LOGIC
        </span>
      </div>
      <p className="text-muted-foreground mb-2">
        Rules stack — all matching rules for a metric are applied in order to the quota.
      </p>
      {rules.map((rule, idx) => {
        const scope = rule.scope ?? "individual";
        return (
          <div key={idx} className="mb-1.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">IF</span> {label} {formatCondition(rule)}
              </p>
              <p className="text-muted-foreground mt-0.5">
                <span className="font-semibold text-foreground">THEN</span> {formatAction(rule)}
              </p>
            </div>
            {renderScopeBadge(scope)}
          </div>
        );
      })}
      {excludedNames.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-medium text-muted-foreground">Excluded members</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {excludedNames.map((name) => (
              <span
                key={name}
                className="text-[10px] px-1.5 py-0.5 rounded border border-border/60 bg-muted/20"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

