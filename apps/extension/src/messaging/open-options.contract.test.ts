import { describe, expect, test } from "bun:test";
import { openOptionsMessageSchema, optionsPathOf } from "./open-options.contract";

describe("open options contract", () => {
  test("sites_request_keeps_the_encoded_origin_in_the_hash", () => {
    const message = openOptionsMessageSchema.parse({
      type: "lambe/open-options",
      section: "sites",
      origin: "https://news.example:8443",
    });

    expect(optionsPathOf(message)).toBe(
      "/options.html#sites?origin=https%3A%2F%2Fnews.example%3A8443",
    );
  });

  test("unknown_sections_and_foreign_origins_are_rejected", () => {
    const parse = (payload: unknown) => openOptionsMessageSchema.safeParse(payload).success;

    expect(parse({ type: "lambe/open-options", section: "debug" })).toBe(false);
    expect(
      parse({ type: "lambe/open-options", section: "sites", origin: "javascript:alert(1)" }),
    ).toBe(false);
    expect(
      parse({ type: "lambe/open-options", section: "cache", origin: "https://a.example" }),
    ).toBe(false);
    expect(optionsPathOf(openOptionsMessageSchema.parse({ type: "lambe/open-options" }))).toBe(
      "/options.html",
    );
  });
});
