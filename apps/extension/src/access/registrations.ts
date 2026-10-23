import { Option } from "@lambe/kernel/option";
import {
  OPTIONAL_HOSTS,
  PAGE_SCRIPT,
  YOUTUBE_CSS,
  YOUTUBE_MAIN_SCRIPT,
  YOUTUBE_MATCHES,
  YOUTUBE_SCRIPT,
} from "../permissions";
import type { Settings } from "../settings/settings";
import type { SiteRule } from "../settings/site-rule";

export interface Registration {
  id: string;
  js: string[];
  css: string[];
  matches: string[];
  world: "ISOLATED" | "MAIN";
  runAt: "document_start" | "document_end" | "document_idle";
  allFrames: boolean;
  persistAcrossSessions: boolean;
}

interface MatchPattern {
  scheme: string;
  host: string;
  path: string;
}

const ALL_URLS = "<all_urls>";

const WEB_SCHEMES = new Set(["http", "https"]);

const PATTERN = /^([^:/]+):\/\/([^/]*)(\/.*)$/;

const SITE_PREFIX = "lambe-site:";

function patternOf(pattern: string): Option<MatchPattern> {
  const [, scheme, host, path] = PATTERN.exec(pattern) ?? [];

  if (scheme === undefined || host === undefined || path === undefined) return Option.none();

  return Option.some({ scheme, host, path });
}

function schemeCovers(granted: string, scheme: string): boolean {
  return granted === scheme || (granted === "*" && WEB_SCHEMES.has(scheme));
}

function hostCovers(granted: string, host: string): boolean {
  if (granted === "*" || granted === host) return true;

  if (!granted.startsWith("*.")) return false;

  const domain = granted.slice(2);

  return host === domain || host.endsWith(`.${domain}`);
}

function covers(granted: MatchPattern, wanted: MatchPattern): boolean {
  return (
    schemeCovers(granted.scheme, wanted.scheme) &&
    hostCovers(granted.host, wanted.host) &&
    (granted.path === "/*" || granted.path === wanted.path)
  );
}

export function isGranted(granted: string[], pattern: string): boolean {
  if (granted.includes(ALL_URLS)) return true;

  return patternOf(pattern)
    .map((wanted) =>
      granted.some((origin) =>
        patternOf(origin)
          .map((grant) => covers(grant, wanted))
          .unwrapOr(false),
      ),
    )
    .unwrapOr(false);
}

function registration(
  id: string,
  js: string,
  matches: string[],
  options: Partial<Pick<Registration, "css" | "world" | "runAt">> = {},
): Registration {
  return {
    id,
    js: [js],
    css: [],
    matches,
    world: "ISOLATED",
    runAt: "document_idle",
    allFrames: false,
    persistAcrossSessions: true,
    ...options,
  };
}

function youtubeRegistrations(): Registration[] {
  return [
    registration("lambe-youtube-main", YOUTUBE_MAIN_SCRIPT, YOUTUBE_MATCHES, {
      world: "MAIN",
      runAt: "document_start",
    }),
    registration("lambe-youtube", YOUTUBE_SCRIPT, YOUTUBE_MATCHES, { css: [YOUTUBE_CSS] }),
  ];
}

export function sitePatternOf(origin: string): Option<string> {
  const url = URL.parse(origin);

  if (url === null) return Option.none();

  return Option.some(`${url.protocol}//${url.hostname}/*`);
}

function siteRegistration(rule: SiteRule, granted: string[]): Registration[] {
  if (!rule.autoTranslate && !rule.hideBubble) return [];

  return sitePatternOf(rule.origin)
    .map((match) =>
      isGranted(granted, match)
        ? [registration(`${SITE_PREFIX}${rule.origin}`, PAGE_SCRIPT, [match])]
        : [],
    )
    .unwrapOr([]);
}

export function desiredRegistrations(settings: Settings, granted: string[]): Registration[] {
  const allowed = (matches: string[]): boolean =>
    matches.every((pattern) => isGranted(granted, pattern));

  const youtube = settings.youtube && allowed(YOUTUBE_MATCHES) ? youtubeRegistrations() : [];

  if (settings.bubbleEverywhere && allowed(OPTIONAL_HOSTS)) {
    return [registration("lambe-page", PAGE_SCRIPT, OPTIONAL_HOSTS), ...youtube];
  }

  return [...settings.sites.flatMap((rule) => siteRegistration(rule, granted)), ...youtube];
}
