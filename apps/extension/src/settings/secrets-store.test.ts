import { describe, expect, test } from "bun:test";
import { SecretsStore } from "./secrets-store";
import { fakeStorageArea } from "./testing/fake-storage-area";

describe("SecretsStore", () => {
  test("api_key_round_trips", async () => {
    const store = new SecretsStore(fakeStorageArea().area);

    expect((await store.apiKey()).isNone()).toBe(true);

    await store.setApiKey("sk-test");

    expect((await store.apiKey()).unwrapOr("")).toBe("sk-test");
  });

  test("clear_removes_the_key", async () => {
    const storage = fakeStorageArea({ "lambe:secrets": { apiKey: "sk-test" } });
    const store = new SecretsStore(storage.area);

    await store.clear();

    expect((await store.apiKey()).isNone()).toBe(true);
    expect(storage.stored("lambe:secrets")).toBeUndefined();
  });
});
