import { describe, expect, test } from "bun:test";
import { OPTIONAL_HOSTS } from "../permissions";
import { onboardingModel } from "./onboarding-model";
import { bubbleEverywhereState } from "./sections/sites-model";
import { fakePermissionDeps } from "./sections/testing/fake-permission-deps";
import { youtubeState } from "./sections/youtube-model";

describe("onboarding model", () => {
  test("consent_requests_site_access_before_any_storage_write", async () => {
    const fake = fakePermissionDeps();
    const grant = Promise.withResolvers<boolean>();
    fake.access.request.mockImplementationOnce(() => grant.promise);

    const consenting = onboardingModel(fake.deps).consent(await fake.current(), 42);

    expect(fake.access.request).toHaveBeenCalledWith(OPTIONAL_HOSTS);
    expect(fake.storage.writes).toEqual([]);

    grant.resolve(true);
    await consenting;

    expect((await fake.current()).consentAt).toBe(42);
  });

  test("refused_access_still_records_consent_and_reports_missing_permission", async () => {
    const fake = fakePermissionDeps({}, false);

    const saved = await onboardingModel(fake.deps).consent(await fake.current(), 42);
    const settings = await fake.current();
    const granted = await fake.access.granted();

    expect(saved.isSuccess).toBe(true);
    expect(settings.consentAt).toBe(42);
    expect(bubbleEverywhereState(settings, granted)).toEqual({ on: true, permissionMissing: true });
    expect(youtubeState(settings, granted)).toEqual({ on: true, permissionMissing: true });
  });

  test("a_failing_permission_prompt_still_records_consent", async () => {
    const fake = fakePermissionDeps();
    fake.access.request.mockImplementationOnce(() => Promise.reject(new Error("no gesture")));

    await onboardingModel(fake.deps).consent(await fake.current(), 42);

    expect((await fake.current()).consentAt).toBe(42);
  });
});
