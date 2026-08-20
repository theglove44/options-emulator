import type { Leg } from "./types";

export function applyObservedPrices(
  legs: readonly Leg[],
  selectedPrices: Readonly<Record<string, number | null>>,
  contractSymbolForLeg: (leg: Leg) => string | null
): Leg[] {
  return legs.map((leg) => {
    const symbol = contractSymbolForLeg(leg);
    const selectedPrice = symbol ? selectedPrices[symbol] : null;
    if (selectedPrice == null) return leg;
    return leg.customPrice != null
      ? { ...leg, observedPrice: selectedPrice, price: leg.customPrice, priceLoaded: true }
      : { ...leg, observedPrice: selectedPrice, price: selectedPrice, priceLoaded: true };
  });
}
