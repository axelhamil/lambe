import type { SettingsStore } from "../settings/settings-store";
import type { HostAccess } from "./host-access";
import { desiredRegistrations, type Registration } from "./registrations";
import type { ScriptRegistrar } from "./script-registrar";

export interface ReconcileDeps {
  settings: SettingsStore;
  access: HostAccess;
  registrar: ScriptRegistrar;
}

const ATTEMPTS = 2;

const sameList = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((entry, index) => entry === right[index]);

function sameRegistration(left: Registration, right: Registration): boolean {
  return (
    sameList(left.js, right.js) &&
    sameList(left.css, right.css) &&
    sameList(left.matches, right.matches) &&
    left.world === right.world &&
    left.runAt === right.runAt &&
    left.allFrames === right.allFrames &&
    left.persistAcrossSessions === right.persistAcrossSessions
  );
}

async function converge({ settings, access, registrar }: ReconcileDeps): Promise<void> {
  const [loaded, granted, registered] = await Promise.all([
    settings.load(),
    access.granted(),
    registrar.registered(),
  ]);
  const desired = desiredRegistrations(loaded.settings, granted);
  const current = new Map(registered.map((registration) => [registration.id, registration]));
  const changed = desired.filter((registration) => {
    const existing = current.get(registration.id);

    return existing !== undefined && !sameRegistration(existing, registration);
  });
  const added = desired.filter((registration) => !current.has(registration.id));
  const kept = new Set(desired.map((registration) => registration.id));
  const stale = registered.map((registration) => registration.id).filter((id) => !kept.has(id));

  if (stale.length > 0) await registrar.unregister(stale);

  if (changed.length > 0) await registrar.update(changed);

  if (added.length > 0) await registrar.register(added);
}

async function attempt(deps: ReconcileDeps, remaining: number): Promise<void> {
  try {
    await converge(deps);
  } catch (cause) {
    if (remaining > 1) return attempt(deps, remaining - 1);

    console.warn("Lambë could not sync its content scripts.", cause);
  }
}

export function reconcile(deps: ReconcileDeps): Promise<void> {
  return attempt(deps, ATTEMPTS);
}

export function reconciler(deps: ReconcileDeps): () => Promise<void> {
  let running = Promise.resolve();

  return () => {
    running = running.then(() => reconcile(deps));

    return running;
  };
}
