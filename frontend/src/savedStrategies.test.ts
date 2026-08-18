import { describe, expect, it } from "vitest";
import { initialLeg } from "./mockData";
import {
  deleteSavedStrategy,
  listSavedStrategies,
  saveStrategy,
  SAVED_STRATEGIES_STORAGE_KEY,
  type SavedStrategyDraft,
  type SavedStrategyStorage
} from "./savedStrategies";

class MemoryStorage implements SavedStrategyStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const draft: SavedStrategyDraft = {
  name: "Fixture long call",
  symbol: "ETHA",
  strategyTemplateId: "long-call",
  strategyName: "Long Call",
  legs: [{ ...initialLeg, strike: 14, expiry: "2026-09-18", price: 0.9, priceLoaded: true }],
  provenance: {
    source: "fixture",
    observedAt: "2026-08-17T14:00:00Z",
    delayed: true,
    stale: false,
    pricingMode: "midpoint"
  },
  assumptions: {
    scenarioDate: "2026-08-24",
    impliedVolatilityOverrides: { "ETHA  260918C00014000": 0.42 }
  }
};

describe("local saved strategies", () => {
  it("persists a complete snapshot with provenance and assumptions", () => {
    const storage = new MemoryStorage();
    const saved = saveStrategy(draft, storage, "2026-08-17T15:00:00Z", "saved-1");

    expect(saved.id).toBe("saved-1");
    expect(listSavedStrategies(storage)).toEqual([saved]);
    expect(JSON.parse(storage.getItem(SAVED_STRATEGIES_STORAGE_KEY) ?? "[]")[0].provenance).toEqual(draft.provenance);

    draft.legs[0].strike = 99;
    expect(listSavedStrategies(storage)[0].legs[0].strike).toBe(14);
  });

  it("returns newest saves first and removes only the requested strategy", () => {
    const storage = new MemoryStorage();
    saveStrategy(draft, storage, "2026-08-17T15:00:00Z", "saved-1");
    saveStrategy({ ...draft, name: "Second" }, storage, "2026-08-17T16:00:00Z", "saved-2");

    expect(listSavedStrategies(storage).map((strategy) => strategy.name)).toEqual(["Second", "Fixture long call"]);
    deleteSavedStrategy("saved-2", storage);
    expect(listSavedStrategies(storage).map((strategy) => strategy.id)).toEqual(["saved-1"]);
  });

  it("ignores malformed or non-array local storage data", () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVED_STRATEGIES_STORAGE_KEY, "not-json");
    expect(listSavedStrategies(storage)).toEqual([]);

    storage.setItem(SAVED_STRATEGIES_STORAGE_KEY, JSON.stringify([{ id: "incomplete" }]));
    expect(listSavedStrategies(storage)).toEqual([]);
  });
});
