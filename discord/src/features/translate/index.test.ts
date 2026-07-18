import { describe, expect, it } from "vitest";
import { autocompleteLanguages, resolveLanguage } from "./index.js";

describe("autocompleteLanguages", () => {
  it("returns no choices for one character", () => {
    expect(autocompleteLanguages("j")).toEqual([]);
  });

  it("resolves a two-letter code to its language name", () => {
    expect(autocompleteLanguages("ja")).toEqual([
      { name: "Japanese", value: "ja" },
    ]);
  });

  it("never exceeds Discord's 25-choice limit", () => {
    const names = Array.from(
      { length: 30 },
      (_, index) => `Test language ${index}`,
    );
    expect(autocompleteLanguages("test", names)).toHaveLength(25);
  });
});

describe("resolveLanguage", () => {
  it("accepts both codes and language names", () => {
    expect(resolveLanguage("ja")).toEqual({ code: "ja", name: "Japanese" });
    expect(resolveLanguage("Japanese")).toEqual({
      code: "ja",
      name: "Japanese",
    });
  });
});
