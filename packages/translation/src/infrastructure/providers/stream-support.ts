import { Result } from "@lambe/kernel/result";
import { z } from "zod";
import type { GenerationStats } from "../../application/ports/translation-provider";
import {
  type ProviderError,
  providerError,
  requestCancelled,
} from "../../domain/provider/provider-error";

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ChatResult = Result<string, ProviderError>;

export interface StreamListeners {
  onText: (delta: string) => void;
  onStats: (stats: GenerationStats) => void;
}

export interface LineDecoder {
  push(line: string): Result<void, ProviderError>;
  isDone(): boolean;
  result(): ChatResult;
}

export interface ProviderFailures {
  readonly name: string;
  refused(status: number): ProviderError | undefined;
  modelMissing(): ProviderError;
  unreachable(reason: string): ProviderError;
  timeout(): ProviderError;
}

interface ProviderRequest {
  fetch: FetchFn;
  url: string;
  init: RequestInit;
  timeoutMs: number;
  signal?: AbortSignal;
  failures: ProviderFailures;
}

interface StreamRequest extends ProviderRequest {
  decoder: LineDecoder;
}

interface JsonRequest<T> extends ProviderRequest {
  schema: z.ZodType<T>;
}

interface IdleTimer {
  reset(): void;
  clear(): void;
}

type Operation = "chat" | "list";

function idleTimer(timeoutMs: number, onIdle: () => void): IdleTimer {
  let timer = setTimeout(onIdle, timeoutMs);

  return {
    reset() {
      clearTimeout(timer);
      timer = setTimeout(onIdle, timeoutMs);
    },
    clear() {
      clearTimeout(timer);
    },
  };
}

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);

    signal.addEventListener("abort", onAbort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

export function jsonOf(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

const errorNameSchema = z.object({ name: z.enum(["AbortError", "TimeoutError"]) });

const isAbort = (error: unknown): boolean => errorNameSchema.safeParse(error).success;

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function transportError(failures: ProviderFailures, error: unknown): ProviderError {
  if (isAbort(error)) return failures.timeout();

  return failures.unreachable(reasonOf(error));
}

function retryAfterMs(header: string | null, now: number): number | undefined {
  if (header === null || header.trim() === "") return undefined;

  const seconds = Number(header);

  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(header);

  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

function rateLimited(failures: ProviderFailures, headers: Headers): ProviderError {
  const message = `${failures.name} is limiting requests (HTTP 429).`;
  const delay = retryAfterMs(headers.get("retry-after"), Date.now());

  if (delay === undefined) return providerError("PROVIDER_RATE_LIMITED", message);

  return providerError("PROVIDER_RATE_LIMITED", message, { retryAfterMs: String(delay) });
}

function statusError(
  failures: ProviderFailures,
  { status, headers }: Response,
  operation: Operation,
): ProviderError | undefined {
  const refused = failures.refused(status);

  if (refused) return refused;

  if (status === 429) return rateLimited(failures, headers);

  if (status === 404 && operation === "chat") return failures.modelMissing();

  if (status >= 200 && status < 300) return undefined;

  return providerError("PROVIDER_BAD_RESPONSE", `${failures.name} answered with HTTP ${status}.`, {
    status: String(status),
  });
}

async function withDeadline<T>(
  timeoutMs: number,
  signal: AbortSignal | undefined,
  run: (idle: IdleTimer, signal: AbortSignal) => Promise<Result<T, ProviderError>>,
): Promise<Result<T, ProviderError>> {
  if (signal?.aborted) return Result.fail(requestCancelled());

  const controller = new AbortController();
  const idle = idleTimer(timeoutMs, () => controller.abort());
  const cancel = () => controller.abort();

  signal?.addEventListener("abort", cancel, { once: true });

  try {
    const result = await run(idle, controller.signal);

    if (result.isFailure && signal?.aborted) return Result.fail(requestCancelled());

    return result;
  } finally {
    idle.clear();
    signal?.removeEventListener("abort", cancel);
  }
}

async function send(
  request: ProviderRequest,
  signal: AbortSignal,
  operation: Operation,
): Promise<Result<Response, ProviderError>> {
  const { fetch, url, init, failures } = request;

  try {
    const response = await fetch(url, { ...init, signal });
    const refused = statusError(failures, response, operation);

    if (refused) return Result.fail(refused);

    return Result.ok(response);
  } catch (error) {
    return Result.fail(transportError(failures, error));
  }
}

async function accumulate(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idle: IdleTimer,
  signal: AbortSignal,
  decoder: LineDecoder,
): Promise<{ result: ChatResult; done: boolean }> {
  const text = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await abortable(reader.read(), signal);

    idle.reset();
    buffer += done ? text.decode() : text.decode(value, { stream: true });

    const lines = buffer.split("\n");

    buffer = done ? "" : (lines.pop() ?? "");

    for (const line of lines) {
      const pushed = decoder.push(line);

      if (pushed.isFailure) return { result: Result.fail(pushed.getError()), done };
    }

    if (decoder.isDone() || done) return { result: decoder.result(), done };
  }
}

async function readStream(
  response: Response,
  idle: IdleTimer,
  signal: AbortSignal,
  { decoder, failures }: StreamRequest,
): Promise<ChatResult> {
  if (response.body === null) {
    return Result.fail(
      providerError("PROVIDER_BAD_RESPONSE", `${failures.name} sent an empty body.`),
    );
  }

  const reader = response.body.getReader();

  try {
    const streamed = await accumulate(reader, idle, signal, decoder);

    if (!streamed.done) void reader.cancel().catch(() => undefined);

    return streamed.result;
  } catch (error) {
    void reader.cancel().catch(() => undefined);

    if (isAbort(error)) return Result.fail(failures.timeout());

    return Result.fail(
      providerError(
        "PROVIDER_BAD_RESPONSE",
        `${failures.name} sent an unreadable body: ${reasonOf(error)}`,
      ),
    );
  }
}

export function streamChat(request: StreamRequest): Promise<ChatResult> {
  return withDeadline(request.timeoutMs, request.signal, async (idle, signal) => {
    const sent = await send(request, signal, "chat");

    if (sent.isFailure) return Result.fail(sent.getError());

    idle.reset();

    return readStream(sent.getValue(), idle, signal, request);
  });
}

export function probeAccess(request: ProviderRequest): Promise<Result<void, ProviderError>> {
  const { fetch, url, init, failures } = request;

  return withDeadline(request.timeoutMs, request.signal, async (_idle, signal) => {
    try {
      const response = await fetch(url, { ...init, signal });
      const refused = failures.refused(response.status);

      if (refused) return Result.fail(refused);

      return Result.ok();
    } catch (error) {
      return Result.fail(transportError(failures, error));
    }
  });
}

export function fetchJson<T>(request: JsonRequest<T>): Promise<Result<T, ProviderError>> {
  const { failures, schema } = request;
  const badResponse = (detail: string) =>
    providerError("PROVIDER_BAD_RESPONSE", `${failures.name} sent ${detail}.`);

  return withDeadline(request.timeoutMs, request.signal, async (_idle, signal) => {
    const sent = await send(request, signal, "list");

    if (sent.isFailure) return Result.fail(sent.getError());

    try {
      const parsed = schema.safeParse(await abortable(sent.getValue().json(), signal));

      if (parsed.success) return Result.ok(parsed.data);

      return Result.fail(badResponse("a model list in an unknown shape"));
    } catch (error) {
      if (isAbort(error)) return Result.fail(failures.timeout());

      return Result.fail(badResponse(`an unreadable model list: ${reasonOf(error)}`));
    }
  });
}
