import { Option } from "@lambe/kernel/option";
import { z } from "zod";

const SECRETS_KEY = "lambe:secrets";

export interface SecretsArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

const secretsSchema = z.object({ apiKey: z.string().min(1) });

export class SecretsStore {
  public constructor(private readonly area: SecretsArea) {}

  public async apiKey(): Promise<Option<string>> {
    try {
      const items = await this.area.get([SECRETS_KEY]);
      const secrets = secretsSchema.safeParse(items[SECRETS_KEY]);

      return secrets.success ? Option.some(secrets.data.apiKey) : Option.none();
    } catch {
      return Option.none();
    }
  }

  public async setApiKey(key: string): Promise<void> {
    await this.area.set({ [SECRETS_KEY]: { apiKey: key } });
  }

  public async clear(): Promise<void> {
    await this.area.remove(SECRETS_KEY);
  }
}
