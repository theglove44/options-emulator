import type { PricingMode } from "./api";
import type { StrategyTemplateId } from "./strategyTemplates";
import type { Leg } from "./types";

export const SAVED_STRATEGIES_STORAGE_KEY = "options-emulator.saved-strategies.v1";

export type SavedStrategySource = "fixture" | "tastytrade";

export type SavedStrategyProvenance = {
  source: SavedStrategySource;
  observedAt: string | null;
  delayed: boolean;
  stale: boolean;
  pricingMode: PricingMode;
};

export type SavedStrategyAssumptions = {
  scenarioDate: string;
  impliedVolatilityOverrides: Record<string, number>;
};

export type SavedStrategyDraft = {
  name: string;
  symbol: string;
  strategyTemplateId: StrategyTemplateId | "custom";
  strategyName: string;
  legs: Leg[];
  provenance: SavedStrategyProvenance;
  assumptions: SavedStrategyAssumptions;
};

export type SavedStrategy = SavedStrategyDraft & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedStrategyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): SavedStrategyStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function listSavedStrategies(storage: SavedStrategyStorage | null = browserStorage()): SavedStrategy[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(SAVED_STRATEGIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSavedStrategy) : [];
  } catch {
    return [];
  }
}

export function saveStrategy(
  draft: SavedStrategyDraft,
  storage: SavedStrategyStorage | null = browserStorage(),
  now = new Date().toISOString(),
  id = createSavedStrategyId()
): SavedStrategy {
  if (!storage) throw new Error("Local strategy storage is unavailable");

  const saved: SavedStrategy = {
    ...draft,
    id,
    createdAt: now,
    updatedAt: now,
    legs: draft.legs.map((leg) => ({ ...leg })),
    provenance: { ...draft.provenance },
    assumptions: {
      scenarioDate: draft.assumptions.scenarioDate,
      impliedVolatilityOverrides: { ...draft.assumptions.impliedVolatilityOverrides }
    }
  };

  try {
    storage.setItem(SAVED_STRATEGIES_STORAGE_KEY, JSON.stringify([saved, ...listSavedStrategies(storage)]));
  } catch {
    throw new Error("The strategy could not be saved locally");
  }
  return saved;
}

export function deleteSavedStrategy(id: string, storage: SavedStrategyStorage | null = browserStorage()): void {
  if (!storage) throw new Error("Local strategy storage is unavailable");
  try {
    storage.setItem(
      SAVED_STRATEGIES_STORAGE_KEY,
      JSON.stringify(listSavedStrategies(storage).filter((strategy) => strategy.id !== id))
    );
  } catch {
    throw new Error("The saved strategy could not be removed");
  }
}

function createSavedStrategyId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `saved-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isSavedStrategy(value: unknown): value is SavedStrategy {
  if (!isRecord(value)) return false;
  const provenance = value.provenance;
  const assumptions = value.assumptions;
  return typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.symbol === "string"
    && typeof value.strategyTemplateId === "string"
    && typeof value.strategyName === "string"
    && typeof value.createdAt === "string"
    && typeof value.updatedAt === "string"
    && Array.isArray(value.legs)
    && value.legs.every(isLeg)
    && isRecord(provenance)
    && isSavedStrategySource(provenance.source)
    && (typeof provenance.observedAt === "string" || provenance.observedAt === null)
    && typeof provenance.delayed === "boolean"
    && typeof provenance.stale === "boolean"
    && isPricingMode(provenance.pricingMode)
    && isRecord(assumptions)
    && typeof assumptions.scenarioDate === "string"
    && isNumberRecord(assumptions.impliedVolatilityOverrides);
}

function isLeg(value: unknown): value is Leg {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && (value.side === "buy" || value.side === "sell")
    && (value.type === "call" || value.type === "put")
    && typeof value.strike === "number"
    && typeof value.expiry === "string"
    && typeof value.quantity === "number"
    && typeof value.price === "number"
    && typeof value.priceLoaded === "boolean"
    && typeof value.multiplier === "number";
}

function isSavedStrategySource(value: unknown): value is SavedStrategySource {
  return value === "fixture" || value === "tastytrade";
}

function isPricingMode(value: unknown): value is PricingMode {
  return value === "midpoint" || value === "bid" || value === "ask" || value === "last";
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "number" && Number.isFinite(item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
