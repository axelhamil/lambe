import { Option } from "@lambe/kernel/option";
import { z } from "zod";
import { webOriginOf } from "../access/web-origin";
import type { SettingsArea, StorageChanges } from "./settings-store";

const SECRETS_KEY = "lambe:secrets";

export interface SecretsArea extends SettingsArea {
  remove(key: string): Promise<void>;
}

const credentialSchema = z.object({ apiKey: z.string().min(1), origin: z.string().min(1) });

export type Credential = z.output<typeof credentialSchema>;

function credentialOf(raw: unknown): Option<Credential> {
  const parsed = credentialSchema.safeParse(raw);

  return parsed.success ? Option.some(parsed.data) : Option.none();
}

export function keyFor(credential: Option<Credential>, baseUrl: string): Option<string> {
  const origin = webOriginOf(baseUrl);

  return credential
    .filter((stored) => origin.filter((wanted) => wanted === stored.origin).isSome())
    .map((stored) => stored.apiKey);
}

export class SecretsStore {
  public constructor(private readonly area: SecretsArea) {}

  public async credential(): Promise<Option<Credential>> {
    try {
      const items = await this.area.get([SECRETS_KEY]);

      return credentialOf(items[SECRETS_KEY]);
    } catch {
      return Option.none();
    }
  }

  public async apiKeyFor(baseUrl: string): Promise<Option<string>> {
    return keyFor(await this.credential(), baseUrl);
  }

  public async setApiKey(apiKey: string, origin: string): Promise<void> {
    await this.area.set({ [SECRETS_KEY]: { apiKey, origin } satisfies Credential });
  }

  public async clear(): Promise<void> {
    await this.area.remove(SECRETS_KEY);
  }

  public subscribe(listener: (credential: Option<Credential>) => void): () => void {
    const onChanged = (changes: StorageChanges): void => {
      if (!Object.hasOwn(changes, SECRETS_KEY)) return;

      listener(credentialOf(changes[SECRETS_KEY]?.newValue));
    };

    this.area.onChanged.addListener(onChanged);

    return () => this.area.onChanged.removeListener(onChanged);
  }
}
