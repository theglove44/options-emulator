export type PricingMode = "midpoint" | "bid" | "ask" | "last";

export type DataContext = {
  source: "fixture" | "tastytrade";
  observed_at: string;
  delayed: boolean;
  stale: boolean;
  pricing_mode: PricingMode | null;
  notes: string[];
};

export type OptionContract = {
  symbol: string;
  streamer_symbol: string | null;
  expiration_date: string;
  days_to_expiration: number;
  strike: number;
  option_type: "call" | "put";
  shares_per_contract: number;
  active: boolean;
};

export type ChainExpiration = {
  expiration_date: string;
  days_to_expiration: number;
  expiration_type: string;
  settlement_type: string;
  contracts: OptionContract[];
};

export type OptionChainResponse = DataContext & {
  underlying_symbol: string;
  expirations: ChainExpiration[];
};

export type SymbolResult = {
  symbol: string;
  description: string;
};

export type SymbolSearchResponse = DataContext & {
  query: string;
  items: SymbolResult[];
};

export type GreekSnapshot = {
  implied_volatility: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  rho: number | null;
  vega: number | null;
};

export type QuoteSnapshot = {
  symbol: string;
  streamer_symbol: string | null;
  instrument_type: string;
  underlying_symbol: string | null;
  expiration_date: string | null;
  strike: number | null;
  option_type: "call" | "put" | null;
  bid: number | null;
  ask: number | null;
  midpoint: number | null;
  last: number | null;
  mark: number | null;
  selected_price: number | null;
  volume: number | null;
  open_interest: number | null;
  greeks: GreekSnapshot | null;
  observed_at: string;
  delayed: boolean;
  stale: boolean;
};

export type QuoteResponse = DataContext & {
  items: QuoteSnapshot[];
  spot_price: number | null;
};

type HealthResponse = {
  status: string;
  mode: "fixture" | "tastytrade";
  broker_access: "read_only";
};

async function getJSON<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = typeof body.detail === "string" ? body.detail : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export function fetchHealth(): Promise<HealthResponse> {
  return getJSON<HealthResponse>("/api/health");
}

export function fetchSymbolSearch(query: string): Promise<SymbolSearchResponse> {
  return getJSON<SymbolSearchResponse>(`/api/symbols/search?query=${encodeURIComponent(query)}`);
}

export function fetchChain(symbol: string): Promise<OptionChainResponse> {
  return getJSON<OptionChainResponse>(`/api/chains/${encodeURIComponent(symbol)}`);
}

export function fetchQuotes(symbols: string[], pricingMode: PricingMode): Promise<QuoteResponse> {
  const params = new URLSearchParams({ pricing_mode: pricingMode });
  symbols.forEach((symbol) => params.append("symbols", symbol));
  return getJSON<QuoteResponse>(`/api/quotes?${params.toString()}`);
}
