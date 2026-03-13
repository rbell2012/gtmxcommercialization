/**
 * Determines whether a row qualifies as a "win" based on opportunity_stage
 * and opportunity_type.
 *
 * Rules:
 *  - Both null  → win (legacy/untyped data)
 *  - "Existing Business (Upsell)" → stage 14+
 *  - Everything else              → stage 16+
 *
 * Stage values are formatted as "N. Label" (e.g. "16. Closed - Onboarded").
 */
export function isWinStage(
  stage: string | null | undefined,
  opportunityType: string | null | undefined,
): boolean {
  if (!stage && !opportunityType) return true;
  if (!stage) return false;
  const num = parseInt(stage, 10);
  if (isNaN(num)) return false;
  const threshold = opportunityType === 'Existing Business (Upsell)' ? 14 : 16;
  return num >= threshold;
}

/**
 * Permissive win check for superhex rows which lack opportunity_type.
 * If `isWon` is explicitly true, the row is a win regardless of stage.
 * Otherwise: null stage → win (benefit of the doubt). Numbered stage →
 * 14+ (most permissive threshold). Non-numeric stage → not a win.
 */
export function isSuperhexWinStage(opStage: string | null | undefined, isWon?: boolean): boolean {
  if (isWon) return true;
  if (!opStage) return true;
  const num = parseInt(opStage, 10);
  if (isNaN(num)) return false;
  return num >= 14;
}
