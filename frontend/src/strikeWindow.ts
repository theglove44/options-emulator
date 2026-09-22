import type { OptionContract, QuoteResponse } from "./api";

export const MIN_VISIBLE_DELTA = 0.1;
export const MAX_VISIBLE_DELTA = 0.9;
export const PREVIEW_STRIKE_LIMIT = 50;

export function selectPreviewStrikeContracts(
  contracts: OptionContract[],
  anchorStrike: number,
  limit = PREVIEW_STRIKE_LIMIT
): OptionContract[] {
  if (contracts.length <= limit) return contracts;
  return contracts
    .slice()
    .sort((left, right) => Math.abs(left.strike - anchorStrike) - Math.abs(right.strike - anchorStrike))
    .slice(0, limit)
    .sort((left, right) => left.strike - right.strike);
}

export function filterStrikeContractsToDeltaWindow(
  contracts: OptionContract[],
  quotes: QuoteResponse,
  selectedSymbols: ReadonlySet<string>
): OptionContract[] {
  const visible = contracts.filter((contract) => {
    const quote = quotes.items.find((item) => item.symbol === contract.symbol);
    const delta = quote?.greeks?.delta;
    return delta != null && Math.abs(delta) >= MIN_VISIBLE_DELTA && Math.abs(delta) <= MAX_VISIBLE_DELTA;
  });

  for (const contract of contracts) {
    if (selectedSymbols.has(contract.symbol) && !visible.some((item) => item.symbol === contract.symbol)) {
      visible.push(contract);
    }
  }

  return visible.length ? visible.sort((left, right) => left.strike - right.strike) : contracts;
}
