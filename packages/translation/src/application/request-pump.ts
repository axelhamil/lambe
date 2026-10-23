import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import { type ProviderError, providerError } from "../domain/provider/provider-error";
import type { ProviderCapacity } from "./ports/provider-capacity";

export interface RequestScope {
  epoch: number;
  signal: AbortSignal;
}

export interface PumpWork<Unit> {
  canPump(): boolean;
  take(free: number, concurrency: number): Unit[][];
  run(units: Unit[], scope: RequestScope): Promise<Result<void, ProviderError>>;
  keyOf(unit: Unit): string;
  drained(failure: Option<ProviderError>): void;
}

export interface RequestPumpDeps {
  capacity: ProviderCapacity;
  maxConcurrency: number;
}

const REQUESTS_AHEAD = 1;

function unreachable(cause: unknown): ProviderError {
  const detail = cause instanceof Error ? cause.message : String(cause);

  return providerError("PROVIDER_UNREACHABLE", `The translation port failed: ${detail}`);
}

export function settle<T>(
  pending: Promise<Result<T, ProviderError>>,
): Promise<Result<T, ProviderError>> {
  return pending.catch((cause: unknown) => Result.fail(unreachable(cause)));
}

function workerDisconnected(): ProviderError {
  return providerError(
    "PROVIDER_UNREACHABLE",
    "The extension worker disconnected twice in a row. Toggle the translation to try again.",
  );
}

export class RequestPump<Unit> {
  private readonly inFlight = new Map<string, AbortController>();
  private readonly controllers = new Set<AbortController>();
  private epoch = 0;
  private leading = false;
  private leader: AbortSignal | undefined;
  private failure: Option<ProviderError> = Option.none();
  private transportRetried = false;
  private transportGeneration = 0;
  private pumping = false;
  private wake: () => void = () => undefined;
  private drained: Promise<void> = Promise.resolve();

  public constructor(
    private readonly work: PumpWork<Unit>,
    private readonly deps: RequestPumpDeps,
  ) {}

  public schedule(): void {
    if (this.pumping) {
      this.wake();

      return;
    }

    if (!this.work.canPump()) return;

    this.pumping = true;
    this.drained = this.pump();
  }

  public cancelAll(): void {
    this.epoch += 1;
    this.transportRetried = false;
    this.failure = Option.none();
    this.endLead();

    for (const controller of this.controllers) controller.abort();

    this.controllers.clear();
  }

  public abortWhere(stale: (keys: string[]) => boolean): void {
    const requests = new Map<AbortController, string[]>();

    for (const [key, controller] of this.inFlight) {
      requests.set(controller, [...(requests.get(controller) ?? []), key]);
    }

    for (const [controller, keys] of requests) if (stale(keys)) controller.abort();
  }

  public isInFlight(key: string): boolean {
    return this.inFlight.has(key);
  }

  public isPumping(): boolean {
    return this.pumping;
  }

  public isCurrent(scope: RequestScope): boolean {
    return scope.epoch === this.epoch;
  }

  public lead(): void {
    this.leading = true;
  }

  public release(scope: RequestScope): void {
    if (!this.leading || scope.signal !== this.leader) return;

    this.endLead();
    this.wake();
  }

  public async whenIdle(): Promise<void> {
    let current: Promise<void>;

    do {
      current = this.drained;
      await current;
    } while (current !== this.drained);
  }

  private async pump(): Promise<void> {
    const failure = await this.drain().catch((cause: unknown) => Option.some(unreachable(cause)));

    this.pumping = false;

    if (failure.isSome()) this.transportRetried = false;

    this.work.drained(failure);
  }

  private async drain(): Promise<Option<ProviderError>> {
    await Promise.resolve();

    const lanes = new Set<Promise<void>>();

    this.failure = Option.none();

    for (;;) {
      const free = this.leading ? 0 : this.laneCount() - lanes.size;
      const requests =
        this.failure.isNone() && this.work.canPump() && free > 0
          ? this.work.take(free, this.concurrency())
          : [];

      for (const units of requests) {
        const lane = this.process(units).then((processed) => {
          lanes.delete(lane);

          if (processed.isFailure && this.failure.isNone())
            this.failure = Option.some(processed.getError());
        });

        lanes.add(lane);
      }

      if (requests.length > 0) continue;

      if (lanes.size === 0) return this.failure;

      await Promise.race([
        ...lanes,
        new Promise<void>((resolve) => {
          this.wake = resolve;
        }),
      ]);
    }
  }

  private laneCount(): number {
    return this.concurrency() + REQUESTS_AHEAD;
  }

  private concurrency(): number {
    return Math.max(1, this.deps.capacity.concurrency().unwrapOr(this.deps.maxConcurrency));
  }

  private async process(units: Unit[]): Promise<Result<void, ProviderError>> {
    const controller = new AbortController();
    const scope = { epoch: this.epoch, signal: controller.signal };
    const generation = this.transportGeneration;
    const keys = units.map((unit) => this.work.keyOf(unit));

    this.controllers.add(controller);

    if (this.leading && this.leader === undefined) this.leader = controller.signal;

    for (const key of keys) this.inFlight.set(key, controller);

    const result = await settle(this.work.run(units, scope));

    this.controllers.delete(controller);

    for (const key of keys) this.inFlight.delete(key);

    if (scope.signal === this.leader) this.endLead();

    if (!this.isCurrent(scope) || scope.signal.aborted) return Result.ok();

    if (result.isFailure) return this.transportFailure(result.getError(), generation);

    this.transportRetried = false;

    return Result.ok();
  }

  private endLead(): void {
    this.leading = false;
    this.leader = undefined;
  }

  private transportFailure(error: ProviderError, generation: number): Result<void, ProviderError> {
    if (error.code !== "REQUEST_CANCELLED") return Result.fail(error);

    if (generation !== this.transportGeneration) return Result.ok();

    if (this.transportRetried) return Result.fail(workerDisconnected());

    this.transportRetried = true;
    this.transportGeneration += 1;

    return Result.ok();
  }
}
