export type OptionType = "call" | "put";
export type Side = "buy" | "sell";

export type Leg = {
  id: string;
  side: Side;
  type: OptionType;
  strike: number;
  expiry: string;
  quantity: number;
  price: number;
  priceLoaded: boolean;
  multiplier: number;
  /** The observed quote retained when a modelled custom entry price is active. */
  observedPrice?: number | null;
  /** A modelled entry-price override, kept separate from the observed quote. */
  customPrice?: number | null;
};

export type ProfilePoint = {
  price: number;
  pnl: number;
};
