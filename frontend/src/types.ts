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
};

export type ProfilePoint = {
  price: number;
  pnl: number;
};
