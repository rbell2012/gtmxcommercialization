/**
 * Parse metrics_ops.line_items format: "Item A ($1.00), Item B ($2.50)"
 * Each segment starts after ^ or a comma so commas inside the list are not swallowed into names.
 * Matches exact product names (trimmed) so shorter names do not match longer suffixes.
 */
const LINE_ITEM_PAIR_RE = /(?:^|,)\s*([^($]+?)\s*\(\$([0-9,.]+)\)/g;

export function parseLineItemTotal(
  lineItemsStr: string | null | undefined,
  targetNames: string[],
): number {
  if (!lineItemsStr?.trim() || targetNames.length === 0) return 0;
  const targets = new Set(
    targetNames.map((t) => t.trim()).filter(Boolean),
  );
  if (targets.size === 0) return 0;

  let sum = 0;
  LINE_ITEM_PAIR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINE_ITEM_PAIR_RE.exec(lineItemsStr)) !== null) {
    const name = m[1].trim();
    if (!targets.has(name)) continue;
    const raw = m[2].replace(/,/g, "");
    const amount = parseFloat(raw);
    if (!Number.isNaN(amount)) sum += amount;
  }
  return sum;
}

/**
 * True if line_items string includes any target product segment (matches exact name in parsed pairs).
 * Counts $0.00 line items as attached (parseLineItemTotal alone would be 0).
 */
export function lineItemsMatchTargetNames(
  lineItemsStr: string | null | undefined,
  targetNames: string[],
): boolean {
  if (!lineItemsStr?.trim() || targetNames.length === 0) return false;
  const targets = new Set(targetNames.map((t) => t.trim()).filter(Boolean));
  if (targets.size === 0) return false;
  LINE_ITEM_PAIR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINE_ITEM_PAIR_RE.exec(lineItemsStr)) !== null) {
    if (targets.has(m[1].trim())) return true;
  }
  return false;
}
