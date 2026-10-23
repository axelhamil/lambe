import { describe, expect, test } from "bun:test";
import { splitCommentMarker } from "./comment-marker";

describe("splitCommentMarker", () => {
  test("splits_double_slash_comment", () => {
    expect(splitCommentMarker("// clone it")).toEqual({
      prefix: "// ",
      body: "clone it",
      suffix: "",
    });
  });

  test("splits_block_comment_with_both_markers", () => {
    expect(splitCommentMarker("/* fork the repo */")).toEqual({
      prefix: "/* ",
      body: "fork the repo",
      suffix: " */",
    });
    expect(splitCommentMarker("<!-- keep this -->")).toEqual({
      prefix: "<!-- ",
      body: "keep this",
      suffix: " -->",
    });
  });

  test("keeps_hash_shebang_untouched_as_empty_body", () => {
    expect(splitCommentMarker("#!/bin/sh")).toEqual({ prefix: "#!/bin/sh", body: "", suffix: "" });
  });

  test("roundtrip_prefix_body_suffix_is_identity", () => {
    const samples = [
      "// clone it",
      "  # install deps  ",
      "-- select rows",
      "; ini value",
      "/** doc block */",
      "   * continuation line",
      "   * last line */",
      " */",
      "/* opened only",
      "<!-- html -->",
      "#!/usr/bin/env bash",
      "  plain text ",
      "",
    ];

    for (const sample of samples) {
      const { prefix, body, suffix } = splitCommentMarker(sample);

      expect(prefix + body + suffix).toBe(sample);
    }

    expect(splitCommentMarker("   * continuation line").body).toBe("continuation line");
    expect(splitCommentMarker("   * last line */").body).toBe("last line");
    expect(splitCommentMarker("  # install deps  ").body).toBe("install deps");
  });

  test("line_comment_marker_wins_over_block_suffix", () => {
    expect(splitCommentMarker("// foo */").prefix).toBe("// ");
    expect(splitCommentMarker(" -->").body).toBe("");
  });
});
