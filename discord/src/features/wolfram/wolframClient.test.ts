import { describe, expect, it } from "vitest";
import { parseWolframResponse, WolframResponseError } from "./wolframClient.js";

describe("parseWolframResponse", () => {
  it("returns typed pods and subpods", () => {
    expect(
      parseWolframResponse({
        queryresult: {
          success: true,
          pods: [
            {
              title: "Result",
              subpods: [
                {
                  plaintext: "42",
                  img: { src: "https://example.invalid/result.png" },
                },
              ],
            },
          ],
        },
      }),
    ).toEqual({
      success: true,
      pods: [
        {
          title: "Result",
          subpods: [
            {
              plaintext: "42",
              img: { src: "https://example.invalid/result.png" },
            },
          ],
        },
      ],
    });
  });

  it("accepts an unsuccessful query without pods", () => {
    expect(parseWolframResponse({ queryresult: { success: false } })).toEqual({
      success: false,
      pods: [],
    });
  });

  it("rejects malformed nested data", () => {
    expect(() =>
      parseWolframResponse({
        queryresult: {
          success: true,
          pods: [{ title: "Result", subpods: [{ plaintext: 42 }] }],
        },
      }),
    ).toThrow(WolframResponseError);
  });
});
