import { describe, expect, test } from "bun:test";
import { YOUTUBE_MATCHES } from "../../permissions";
import { fakePermissionDeps } from "./testing/fake-permission-deps";
import { youtubeModel } from "./youtube-model";

describe("youtube model", () => {
  test("enabling_requests_the_youtube_origin_then_saves", async () => {
    const fake = fakePermissionDeps();
    const grant = Promise.withResolvers<boolean>();
    fake.access.request.mockImplementationOnce(() => grant.promise);

    const changing = youtubeModel(fake.deps).setEnabled(true);

    expect(fake.access.request).toHaveBeenCalledWith(YOUTUBE_MATCHES);
    expect(fake.storage.writes).toEqual([]);

    grant.resolve(true);

    expect((await changing).isSuccess).toBe(true);
    expect((await fake.current()).youtube).toBe(true);
  });

  test("denied_grant_leaves_it_off", async () => {
    const fake = fakePermissionDeps({}, false);

    const changed = await youtubeModel(fake.deps).setEnabled(true);

    expect(changed.getError()).toEqual({ code: "PERMISSION_DENIED" });
    expect((await fake.current()).youtube).toBe(false);
    expect(fake.storage.writes).toEqual([]);
  });
});
