import { useSyncExternalStore } from "react";

export interface HashRoute {
  hash: string;
  go(hash: string): void;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);

  return () => window.removeEventListener("hashchange", onChange);
}

const currentHash = (): string => window.location.hash;

const go = (hash: string): void => {
  window.location.hash = hash;
};

export function useHash(): HashRoute {
  return { hash: useSyncExternalStore(subscribe, currentHash), go };
}
