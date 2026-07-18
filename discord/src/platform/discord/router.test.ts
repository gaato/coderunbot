/**
 * Tests startup route validation and prefix parsing in the Discord platform router.
 */
import { describe, expect, it } from "vitest";
import type { Feature } from "../../types.js";
import { buildRouteRegistry, parsePrefixCommand } from "./router.js";

describe("buildRouteRegistry", () => {
  it("fails fast when customId namespaces overlap across handler kinds", () => {
    const modalFeature: Feature = {
      id: "code",
      modalHandlers: {
        shared: async () => undefined,
      },
    };
    const componentFeature: Feature = {
      id: "tex",
      componentHandlers: {
        shared: async () => undefined,
      },
    };

    expect(() => buildRouteRegistry([modalFeature, componentFeature])).toThrow(
      "duplicate customId namespace route: shared",
    );
  });

  it("rejects central and collector-owned namespaces", () => {
    const feature: Feature = {
      id: "code",
      componentHandlers: {
        pg: async () => undefined,
      },
    };

    expect(() => buildRouteRegistry([feature])).toThrow(
      "customId namespace is reserved: pg",
    );
  });
});

describe("parsePrefixCommand", () => {
  it("preserves the raw rest argument after one separator", () => {
    expect(parsePrefixCommand("]run  python\nprint(1)", "]")).toEqual({
      name: "run",
      args: " python\nprint(1)",
    });
  });
});
