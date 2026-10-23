import { describe, expect, test } from "bun:test";
import { t } from "../../i18n/t";
import { OPTIONAL_HOSTS } from "../../permissions";
import { defaultSettings, type ProviderSettings } from "../../settings/settings";
import { changeNoticeOf } from "./permission-change";
import {
  bubbleEverywhereState,
  pendingOriginOf,
  siteLabel,
  siteRows,
  sitesModel,
} from "./sites-model";
import { fakePermissionDeps } from "./testing/fake-permission-deps";

const ORIGIN = "https://example.org";

const SITE = `${ORIGIN}/*`;

const PROVIDER_ORIGIN = "https://api.example.com";

const REMOTE_PROVIDER: ProviderSettings = {
  ...defaultSettings("en").provider,
  kind: "openai-compatible",
  baseUrl: `${PROVIDER_ORIGIN}/v1`,
  model: "gpt-mini",
};

describe("sites model", () => {
  test("bubble_everywhere_is_saved_only_after_the_grant", async () => {
    const fake = fakePermissionDeps();
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
    const fake = fakePermissionDeps({ bubbleEverywhere: false }, false);

    const changed = await sitesModel(fake.deps).setBubbleEverywhere(true);

    expect(changed.getError()).toEqual({ code: "PERMISSION_DENIED" });
    expect(fake.storage.writes).toEqual([]);
    expect((await fake.current()).bubbleEverywhere).toBe(false);
  });

  test("turning_it_off_keeps_origins_a_site_rule_still_needs", async () => {
    const withRule = fakePermissionDeps({
      bubbleEverywhere: true,
      sites: [{ origin: ORIGIN, autoTranslate: true, hideBubble: false }],
    });

    const changed = await sitesModel(withRule.deps).setBubbleEverywhere(false);

    expect((await withRule.current()).bubbleEverywhere).toBe(false);
    expect(withRule.access.remove).not.toHaveBeenCalled();
    expect(changeNoticeOf(changed).unwrap()).toContain(t("options.sites.keptNeeded"));
  });

  test("turning_it_off_removes_https_access_and_says_http_access_stays", async () => {
    const fake = fakePermissionDeps({ bubbleEverywhere: true, youtube: false });

    const changed = await sitesModel(fake.deps).setBubbleEverywhere(false);

    expect(fake.access.remove).toHaveBeenCalledWith(["https://*/*"]);
    expect(changeNoticeOf(changed).unwrap()).toBe(t("options.sites.keptHttp"));
  });

  test("turning_it_off_keeps_the_access_a_remote_provider_needs", async () => {
    const fake = fakePermissionDeps({ bubbleEverywhere: true, provider: REMOTE_PROVIDER });

    const changed = await sitesModel(fake.deps).setBubbleEverywhere(false);

    expect(fake.access.remove).not.toHaveBeenCalled();
    expect(changeNoticeOf(changed).unwrap()).toContain(t("options.sites.keptNeeded"));
  });

  test("removing_a_site_rule_on_the_provider_host_keeps_its_access", async () => {
    const fake = fakePermissionDeps({
      provider: REMOTE_PROVIDER,
      sites: [{ origin: PROVIDER_ORIGIN, autoTranslate: true, hideBubble: false }],
    });

    const changed = await sitesModel(fake.deps).removeRule(PROVIDER_ORIGIN);

    expect((await fake.current()).sites).toEqual([]);
    expect(fake.access.remove).not.toHaveBeenCalled();
    expect(changeNoticeOf(changed).unwrap()).toBe(t("options.sites.keptNeeded"));
  });

  test("pending_origin_from_the_menu_is_prefilled", async () => {
    const fake = fakePermissionDeps();
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

  test("an_http_site_shows_its_scheme_and_an_https_site_only_its_host", () => {
    expect(siteLabel("http://intranet.example:8080")).toBe("http://intranet.example:8080");
    expect(siteLabel(ORIGIN)).toBe("example.org");
  });

  test("removing_the_last_flag_removes_the_rule_and_its_permission", async () => {
    const fake = fakePermissionDeps({
      bubbleEverywhere: false,
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
