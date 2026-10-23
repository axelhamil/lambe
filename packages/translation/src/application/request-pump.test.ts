import { describe, expect, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import {
  type ProviderError,
  providerError,
  requestCancelled,
} from "../domain/provider/provider-error";
import { type PumpWork, RequestPump, type RequestScope } from "./request-pump";

interface Call {
  units: string[];
  scope: RequestScope;
  finish: (result: Result<void, ProviderError>) => void;
  fail: (cause: unknown) => void;
}

interface Harness {
  pump: RequestPump<string>;
  calls: Call[];
  pending: string[];
  failures: Option<ProviderError>[];
  leaders: Set<string>;
}

function harness(options: { capacity?: number; maxConcurrency?: number } = {}): Harness {
  const calls: Call[] = [];
  const pending: string[] = [];
  const failures: Option<ProviderError>[] = [];
  const leaders = new Set<string>();
  const take = (free: number): string[][] => {
    const [next] = pending;

    if (next === undefined || !leaders.has(next))
      return pending.splice(0, free).map((unit) => [unit]);

    pending.shift();
    pump.lead();

    return [[next]];
  };
  const work: PumpWork<string> = {
    canPump: () => true,
    take,
    run: (units, scope) =>
      new Promise((resolve, reject) => {
        calls.push({ units, scope, finish: resolve, fail: reject });
      }),
    keyOf: (unit) => unit,
    drained: (failure) => {
      failures.push(failure);
    },
  };
  const capacity = options.capacity;
  const pump = new RequestPump(work, {
    capacity: {
      concurrency: () => (capacity === undefined ? Option.none() : Option.some(capacity)),
    },
    maxConcurrency: options.maxConcurrency ?? 2,
  });

  return { pump, calls, pending, failures, leaders };
}

const settle = async (): Promise<void> => {
  for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
};

const callAt = (calls: Call[], index: number): Call => {
  const call = calls[index];

  if (call === undefined) throw new Error(`No call at ${index}.`);

  return call;
};

describe("RequestPump", () => {
  test("opens_capacity_plus_one_lanes", async () => {
    const { pump, calls, pending } = harness({ capacity: 2 });

    pending.push("a", "b", "c", "d", "e");
    pump.schedule();
    await settle();

    expect(calls.map((call) => call.units)).toEqual([["a"], ["b"], ["c"]]);

    callAt(calls, 0).finish(Result.ok());
    await settle();

    expect(calls.map((call) => call.units)).toEqual([["a"], ["b"], ["c"], ["d"]]);
  });

  test("rejected_run_drains_with_provider_unreachable", async () => {
    const { pump, calls, pending, failures } = harness();

    pending.push("a");
    pump.schedule();
    await settle();
    callAt(calls, 0).fail(new Error("port closed"));
    await pump.whenIdle();

    expect(failures).toHaveLength(1);
    expect(failures[0]?.unwrap().code).toBe("PROVIDER_UNREACHABLE");
    expect(failures[0]?.unwrap().message).toContain("port closed");
  });

  test("cancel_all_aborts_every_signal_and_ignores_their_results", async () => {
    const { pump, calls, pending, failures } = harness();

    pending.push("a", "b");
    pump.schedule();
    await settle();
    pump.cancelAll();

    expect(calls.every((call) => call.scope.signal.aborted)).toBe(true);
    expect(calls.some((call) => pump.isCurrent(call.scope))).toBe(false);

    callAt(calls, 0).finish(Result.fail(providerError("PROVIDER_FORBIDDEN_ORIGIN", "Refused.")));
    callAt(calls, 1).finish(Result.fail(requestCancelled()));
    await pump.whenIdle();

    expect(failures).toEqual([Option.none()]);
  });

  test("abort_where_aborts_only_matching_requests", async () => {
    const { pump, calls, pending } = harness();

    pending.push("a", "b");
    pump.schedule();
    await settle();
    pump.abortWhere((keys) => keys.includes("b"));

    expect(callAt(calls, 0).scope.signal.aborted).toBe(false);
    expect(callAt(calls, 1).scope.signal.aborted).toBe(true);
    expect(pump.isInFlight("a")).toBe(true);
  });

  test("second_transport_cancel_in_a_row_reports_worker_disconnected", async () => {
    const { pump, calls, pending, failures } = harness();

    pending.push("a");
    pump.schedule();
    await settle();
    callAt(calls, 0).finish(Result.fail(requestCancelled()));
    await settle();
    pending.push("b");
    pump.schedule();
    await settle();

    expect(failures).toEqual([Option.none()]);

    callAt(calls, 1).finish(Result.fail(requestCancelled()));
    await pump.whenIdle();

    expect(failures).toHaveLength(2);
    expect(failures[1]?.unwrap().message).toContain("disconnected twice in a row");
  });

  test("lead_blocks_other_lanes_until_its_release", async () => {
    const { pump, calls, pending, leaders } = harness({ capacity: 2 });

    leaders.add("a");
    pending.push("a", "b", "c");
    pump.schedule();
    await settle();
    const held = calls.length;
    pump.release(callAt(calls, 0).scope);
    await settle();

    expect(held).toBe(1);
    expect(calls.map((call) => call.units)).toEqual([["a"], ["b"], ["c"]]);
  });

  test("only_the_lead_request_releases_the_lead", async () => {
    const { pump, calls, pending, leaders } = harness({ capacity: 1 });

    pending.push("a", "b");
    pump.schedule();
    await settle();
    leaders.add("c");
    pending.push("c", "d");
    callAt(calls, 0).finish(Result.ok());
    await settle();
    pump.release(callAt(calls, 1).scope);
    callAt(calls, 1).finish(Result.ok());
    await settle();
    const whileLeading = calls.map((call) => call.units);
    callAt(calls, 2).finish(Result.ok());
    await settle();

    expect(whileLeading).toEqual([["a"], ["b"], ["c"]]);
    expect(calls.map((call) => call.units)).toEqual([["a"], ["b"], ["c"], ["d"]]);
  });

  test("failure_before_cancel_all_does_not_stop_the_next_epoch", async () => {
    const { pump, calls, pending, failures } = harness({ capacity: 1 });

    pending.push("a", "b");
    pump.schedule();
    await settle();
    callAt(calls, 0).finish(Result.fail(providerError("PROVIDER_FORBIDDEN_ORIGIN", "Refused.")));
    await settle();
    pump.cancelAll();
    pending.push("c");
    pump.schedule();
    await settle();
    callAt(calls, 1).finish(Result.fail(requestCancelled()));
    await settle();
    callAt(calls, 2).finish(Result.ok());
    await pump.whenIdle();

    expect(calls.map((call) => call.units)).toEqual([["a"], ["b"], ["c"]]);
    expect(failures).toEqual([Option.none()]);
  });
});
