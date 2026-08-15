import type { Leg, ProfilePoint } from "./types";

export const expiries = [
  { label: "21 Aug", value: "2026-08-21", dte: 6 },
  { label: "28 Aug", value: "2026-08-28", dte: 13 },
  { label: "18 Sep", value: "2026-09-18", dte: 34 },
  { label: "16 Oct", value: "2026-10-16", dte: 62 },
  { label: "18 Dec", value: "2026-12-18", dte: 125 },
  { label: "15 Jan 27", value: "2027-01-15", dte: 153 }
];

export const initialLeg: Leg = {
  id: "leg-1",
  side: "buy",
  type: "call",
  strike: 14,
  expiry: "2026-09-18",
  quantity: 1,
  price: 0.9
};

export function buildProfile(leg: Leg, spot: number): ProfilePoint[] {
  const low = spot * 0.86;
  const high = spot * 1.14;
  return Array.from({ length: 33 }, (_, index) => {
    const price = low + ((high - low) * index) / 32;
    const intrinsic = leg.type === "call"
      ? Math.max(price - leg.strike, 0)
      : Math.max(leg.strike - price, 0);
    const pnl = (intrinsic - leg.price) * leg.quantity * 100 * (leg.side === "buy" ? 1 : -1);
    return { price, pnl };
  });
}
