import { describe, expect, test } from "bun:test";
import { invalidateWhenOrphaned } from "./orphan-watch";

const fakeContext = () => {
  const controller = new AbortController();

  return {
    signal: controller.signal,
    abort: (reason: string) => controller.abort(reason),
    onInvalidated: (cb: () => void) => {
      controller.signal.addEventListener("abort", cb);

      return () => controller.signal.removeEventListener("abort", cb);
    },
  };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("invalidateWhenOrphaned", () => {
  test("an_updated_or_removed_extension_invalidates_the_old_page_script", async () => {
    const ctx = fakeContext();
    let extensionId: string | undefined = "lambe";

    invalidateWhenOrphaned(ctx, () => extensionId, 5);
    await tick();
    expect(ctx.signal.aborted).toBe(false);

    extensionId = undefined;
    await tick();
    expect(ctx.signal.aborted).toBe(true);
  });
});
