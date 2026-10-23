import type { Hasher } from "../../application/ports/hasher";

export const sha256Hasher: Hasher = {
  async sha256Hex(input) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));

    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  },
};
