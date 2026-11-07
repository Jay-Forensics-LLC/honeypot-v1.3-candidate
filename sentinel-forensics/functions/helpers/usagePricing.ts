export function getSafeUsageCostCents(quantity: number, unitCost: number): number | null {
  const costCents = Math.round(quantity * unitCost);
  return Number.isSafeInteger(costCents) ? costCents : null;
}
