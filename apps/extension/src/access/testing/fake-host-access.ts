import { mock } from "bun:test";
import type { HostAccess } from "../host-access";

interface FakeHostAccessOptions {
  granted?: string[];
  grants?: boolean;
}

export function fakeHostAccess({ granted = [], grants = true }: FakeHostAccessOptions = {}) {
  const origins = [...granted];

  const access = {
    granted: mock(async () => [...origins]),
    request: mock(async (wanted: string[]) => {
      if (!grants) return false;

      origins.push(...wanted.filter((origin) => !origins.includes(origin)));

      return true;
    }),
    remove: mock(async (removed: string[]) => {
      for (const origin of removed) {
        const index = origins.indexOf(origin);

        if (index >= 0) origins.splice(index, 1);
      }

      return true;
    }),
  } satisfies HostAccess;

  return { access, origins };
}
