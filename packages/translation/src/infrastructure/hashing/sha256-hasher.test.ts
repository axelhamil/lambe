import { expect, test } from "bun:test";
import { sha256Hasher } from "./sha256-hasher";

test("matches_known_vector", async () => {
  expect(await sha256Hasher.sha256Hex("abc")).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
