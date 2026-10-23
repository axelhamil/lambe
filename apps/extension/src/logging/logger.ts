import type { DebugLog } from "@lambe/translation/application/ports/debug-log";
import type { Settings } from "../settings/settings";
import type { SettingsStore } from "../settings/settings-store";

type LogMethod = (message: string, ...details: unknown[]) => void;

export interface Logger extends DebugLog {
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
}

interface LogSink {
  debug(...data: unknown[]): void;
  info(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
}

interface CurrentSettings {
  current(): Pick<Settings, "debug">;
}

const SECRET_FIELD = "apiKey";

const REDACTED = "[redacted]";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function redact(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) return REDACTED;

    seen.add(value);

    return value.map((item) => redact(item, seen));
  }

  if (!isPlainObject(value)) return value;

  if (seen.has(value)) return REDACTED;

  seen.add(value);

  return Object.fromEntries(
    Object.entries(value).map(([field, item]) => [
      field,
      field === SECRET_FIELD ? REDACTED : redact(item, seen),
    ]),
  );
}

export function createLogger(settings: CurrentSettings, sink: LogSink = console): Logger {
  const write =
    (method: keyof LogSink, gated: boolean): LogMethod =>
    (message, ...details) => {
      if (gated && !settings.current().debug) return;

      const seen = new WeakSet<object>();

      sink[method](message, ...details.map((detail) => redact(detail, seen)));
    };

  return {
    debug: write("debug", true),
    info: write("info", true),
    warn: write("warn", false),
    error: write("error", false),
  };
}

export function debugSetting(store: SettingsStore): CurrentSettings {
  let debug = false;
  let changed = false;

  store.subscribe(({ settings }) => {
    changed = true;
    debug = settings.debug;
  });
  store.load().then(
    ({ settings }) => {
      if (!changed) debug = settings.debug;
    },
    () => undefined,
  );

  return { current: () => ({ debug }) };
}
