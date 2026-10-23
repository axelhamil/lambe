import { describe, expect, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import { SecretsStore } from "./secrets-store";
import { fakeStorageArea } from "./testing/fake-storage-area";

const ORIGIN = "https://api.example.test";

describe("SecretsStore", () => {
  test("api_key_is_returned_only_for_the_origin_it_was_saved_for", async () => {
    const store = new SecretsStore(fakeStorageArea().area);

    await store.setApiKey("sk-test", ORIGIN);

    expect(await store.apiKeyFor(`${ORIGIN}/v1`)).toEqual(Option.some("sk-test"));
    expect((await store.apiKeyFor("https://other.example.test/v1")).isNone()).toBe(true);
    expect((await store.apiKeyFor(`${ORIGIN}:8443/v1`)).isNone()).toBe(true);
  });

  test("key_saved_without_an_origin_is_never_sent", async () => {
    const store = new SecretsStore(fakeStorageArea({ "lambe:secrets": { apiKey: "sk-old" } }).area);

    expect((await store.apiKeyFor(`${ORIGIN}/v1`)).isNone()).toBe(true);
  });

  test("clear_removes_the_key", async () => {
    const storage = fakeStorageArea({ "lambe:secrets": { apiKey: "sk-test", origin: ORIGIN } });
    const store = new SecretsStore(storage.area);

    await store.clear();

    expect((await store.credential()).isNone()).toBe(true);
    expect(storage.stored("lambe:secrets")).toBeUndefined();
  });
});
