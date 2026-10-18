import { describe, expect, mock, test } from "bun:test";
import { Result } from "@lambe/kernel/result";
import type { TranslationProvider } from "../../application/ports/translation-provider";
import type { ChatMessage } from "../../domain/prompt/prompt-adapter";
import { type ProviderError, providerError } from "../../domain/provider/provider-error";
import { ConcurrencyLimitedProvider } from "./concurrency-limited-provider";

type Chat = TranslationProvider["chat"];

const providerOf = (chat: Chat): TranslationProvider => ({
  id: "ollama",
  model: "translategemma:12b",
  chat,
});

const ask = (content: string): ChatMessage[] => [{ role: "user", content }];

const options = { contextTokens: 2048 };

describe("ConcurrencyLimitedProvider", () => {
  test("never_runs_more_than_limit_calls_at_once", async () => {
    let running = 0;
    let maxRunning = 0;
    const started: string[] = [];
    const inner = providerOf(
      mock(async (messages: ChatMessage[]): Promise<Result<string, ProviderError>> => {
        const content = messages[0]?.content ?? "";

        running += 1;
        maxRunning = Math.max(maxRunning, running);
        started.push(content);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;

        return Result.ok(content);
      }),
    );
    const limited = new ConcurrencyLimitedProvider(inner, 1);

    const results = await Promise.all(
      ["a", "b", "c"].map((content) => limited.chat(ask(content), options)),
    );

    expect(maxRunning).toBe(1);
    expect(started).toEqual(["a", "b", "c"]);
    expect(results.map((result) => result.getValue())).toEqual(["a", "b", "c"]);
    expect(limited.id).toBe("ollama");
    expect(limited.model).toBe("translategemma:12b");
  });

  test("releases_the_slot_when_the_inner_call_fails", async () => {
    const inner = providerOf(
      mock(
        async (messages: ChatMessage[]): Promise<Result<string, ProviderError>> =>
          messages[0]?.content === "fail"
            ? Result.fail(providerError("PROVIDER_UNREACHABLE", "down"))
            : Result.ok("ok"),
      ),
    );
    const limited = new ConcurrencyLimitedProvider(inner, 1);

    const failed = await limited.chat(ask("fail"), options);
    const next = await limited.chat(ask("next"), options);

    expect(failed.getError().code).toBe("PROVIDER_UNREACHABLE");
    expect(next.getValue()).toBe("ok");
  });

  test("maps_an_inner_rejection_to_a_failure_and_releases_the_slot", async () => {
    const inner = providerOf(
      mock(async (messages: ChatMessage[]): Promise<Result<string, ProviderError>> => {
        if (messages[0]?.content === "boom") throw new Error("boom");

        return Result.ok("ok");
      }),
    );
    const limited = new ConcurrencyLimitedProvider(inner, 1);

    const [rejected, next] = await Promise.all([
      limited.chat(ask("boom"), options),
      limited.chat(ask("next"), options),
    ]);

    expect(rejected.getError().code).toBe("PROVIDER_UNREACHABLE");
    expect(next.getValue()).toBe("ok");
  });

  test("rejects_a_limit_that_is_not_a_positive_integer", () => {
    const inner = providerOf(mock(async () => Result.ok<string, ProviderError>("ok")));

    for (const limit of [0, -1, 1.5, Number.NaN]) {
      expect(() => new ConcurrencyLimitedProvider(inner, limit)).toThrow(RangeError);
    }
  });
});
