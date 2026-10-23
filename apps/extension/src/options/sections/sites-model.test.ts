import { describe, expect, test } from "bun:test";
import { OPTIONAL_HOSTS } from "../../permissions";
import { defaultSettings } from "../../settings/settings";
import { bubbleEverywhereState, pendingOriginOf, siteRows, sitesModel } from "./sites-model";
import { fakeSettingsAccess } from "./testing/fake-settings-access";

const ORIGIN = "https://example.org";

const SITE = `${ORIGIN}/*`;

describe("sites model", () => {
  test("bubble_everywhere_is_saved_only_after_the_grant", async () => {
    const fake = fakeSettingsAccess();
    const grant = Promise.withResolvers<boolean>();
    fake.access.request.mockImplementationOnce(() => grant.promise);

    const changing = sitesModel(fake.deps).setBubbleEverywhere(true);

    expect(fake.access.request).toHaveBeenCalledWith(OPTIONAL_HOSTS);
    expect(fake.storage.writes).toEqual([]);

    grant.resolve(true);

    expect((await changing).isSuccess).toBe(true);
    expect((await fake.current()).bubbleEverywhere).toBe(true);
  });

  test("denied_grant_leaves_the_setting_off", async () => {
    const fake = fakeSettingsAccess({}, false);

    const changed = await sitesModel(fake.deps).setBubbleEverywhere(true);

    expect(changed.getError()).toEqual({ code: "PERMISSION_DENIED" });
    expect(fake.storage.writes).toEqual([]);
    expect((await fake.current()).bubbleEverywhere).toBe(false);
  });

  test("turning_it_off_keeps_origins_a_site_rule_still_needs", async () => {
    const withRule = fakeSettingsAccess({
      bubbleEverywhere: true,
      sites: [{ origin: ORIGIN, autoTranslate: true, hideBubble: false }],
    });
    const withoutRule = fakeSettingsAccess({ bubbleEverywhere: true });

    await sitesModel(withRule.deps).setBubbleEverywhere(false);
    await sitesModel(withoutRule.deps).setBubbleEverywhere(false);

    expect((await withRule.current()).bubbleEverywhere).toBe(false);
    expect(withRule.access.remove).not.toHaveBeenCalled();
    expect(withoutRule.access.remove).toHaveBeenCalledWith(["https://*/*"]);
  });

  test("pending_origin_from_the_menu_is_prefilled", async () => {
    const fake = fakeSettingsAccess();
    const pending = pendingOriginOf(`#sites?origin=${encodeURIComponent(`${ORIGIN}/`)}`);

    await sitesModel(fake.deps).addSite(pending.unwrap());

    expect(pending.unwrap()).toBe(ORIGIN);
    expect(pendingOriginOf("#sites?origin=javascript:alert(1)").isNone()).toBe(true);
    expect(pendingOriginOf("#sites").isNone()).toBe(true);
    expect(fake.access.request).toHaveBeenCalledWith([SITE]);
    expect((await fake.current()).sites).toEqual([
      { origin: ORIGIN, autoTranslate: true, hideBubble: false },
    ]);
  });

  test("removing_the_last_flag_removes_the_rule_and_its_permission", async () => {
    const fake = fakeSettingsAccess({
      sites: [{ origin: ORIGIN, autoTranslate: true, hideBubble: false }],
    });

    await sitesModel(fake.deps).setRule({
      origin: ORIGIN,
      autoTranslate: false,
      hideBubble: false,
    });

    expect((await fake.current()).sites).toEqual([]);
    expect(fake.access.remove).toHaveBeenCalledWith([SITE]);
  });

  test("revoked_permission_is_reported_not_hidden", () => {
    const settings = {
      ...defaultSettings("en"),
      bubbleEverywhere: true,
      sites: [{ origin: ORIGIN, autoTranslate: true, hideBubble: false }],
    };

    expect(bubbleEverywhereState(settings, [])).toEqual({ on: true, permissionMissing: true });
    expect(siteRows(settings, []).map((row) => row.permissionMissing)).toEqual([true]);
    expect(bubbleEverywhereState(settings, OPTIONAL_HOSTS).permissionMissing).toBe(false);
    expect(siteRows(settings, OPTIONAL_HOSTS).map((row) => row.permissionMissing)).toEqual([false]);
  });
});
