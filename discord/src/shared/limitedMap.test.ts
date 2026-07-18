import { describe, expect, it } from "vitest";
import { LimitedSizeMap } from "./limitedMap.js";

describe("LimitedSizeMap", () => {
  it("evicts the oldest insertion when capacity is exceeded", () => {
    const map = new LimitedSizeMap<string, number>(2);
    map.set("first", 1).set("second", 2).set("third", 3);

    expect([...map]).toEqual([
      ["second", 2],
      ["third", 3],
    ]);
  });

  it("keeps the original insertion order when an existing key is updated", () => {
    const map = new LimitedSizeMap<string, number>(2);
    map.set("first", 1).set("second", 2).set("first", 10).set("third", 3);

    expect(map.has("first")).toBe(false);
    expect([...map]).toEqual([
      ["second", 2],
      ["third", 3],
    ]);
  });

  it("supports undefined as a key", () => {
    const map = new LimitedSizeMap<string | undefined, number>(1);
    map.set(undefined, 1).set("next", 2);

    expect([...map]).toEqual([["next", 2]]);
  });

  it("rejects invalid capacities", () => {
    expect(() => new LimitedSizeMap(0)).toThrow(RangeError);
    expect(() => new LimitedSizeMap(1.5)).toThrow(RangeError);
  });
});
