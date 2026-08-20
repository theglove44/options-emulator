import { describe, expect, it } from "vitest";
import { commitNumericDraft } from "./numericDraft";

describe("numeric draft editing", () => {
  it("keeps empty and decimal drafts out of committed calculation state", () => {
    expect(commitNumericDraft("", 0.65, { minimum: 0 })).toEqual({
      accepted: false,
      value: 0.65,
      draft: "0.65"
    });
    expect(commitNumericDraft(".", 0.65, { minimum: 0 })).toEqual({
      accepted: false,
      value: 0.65,
      draft: "0.65"
    });
    expect(commitNumericDraft("0.72", 0.65, { minimum: 0 }).value).toBe(0.72);
  });

  it("allows an empty custom-price commit but rejects negative values", () => {
    expect(commitNumericDraft("", 1.2, { minimum: 0, allowEmpty: true })).toEqual({
      accepted: true,
      value: null,
      draft: ""
    });
    expect(commitNumericDraft("-1", 1.2, { minimum: 0, allowEmpty: true })).toEqual({
      accepted: false,
      value: 1.2,
      draft: "1.2"
    });
  });

  it("accepts IV decimals within range and restores invalid input", () => {
    expect(commitNumericDraft("55.5", 45, { minimum: 0.1, maximum: 500 }).value).toBe(55.5);
    expect(commitNumericDraft("501", 45, { minimum: 0.1, maximum: 500 })).toEqual({
      accepted: false,
      value: 45,
      draft: "45"
    });
  });
});
