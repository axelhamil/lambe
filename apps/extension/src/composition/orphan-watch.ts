interface Invalidatable {
  abort(reason: string): void;
  onInvalidated(cb: () => void): () => void;
}

const CHECK_MS = 1000;

const liveExtensionId = (): string | undefined => chrome.runtime?.id;

export function invalidateWhenOrphaned(
  ctx: Invalidatable,
  extensionId: () => string | undefined = liveExtensionId,
  everyMs = CHECK_MS,
): void {
  const timer = setInterval(() => {
    if (extensionId() !== undefined) return;

    ctx.abort("Lambë was updated or removed");
  }, everyMs);

  ctx.onInvalidated(() => clearInterval(timer));
}
