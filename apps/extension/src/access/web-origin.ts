import { Option } from "@lambe/kernel/option";
import { LOCAL_HOSTNAMES } from "../permissions";

const WEB_PROTOCOLS = new Set(["http:", "https:"]);

export function isWebProtocol(protocol: string): boolean {
  return WEB_PROTOCOLS.has(protocol);
}

export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTNAMES.includes(hostname);
}

export function webUrlOf(input: string): Option<URL> {
  return Option.fromNullable(URL.parse(input.trim())).filter(
    (url) => isWebProtocol(url.protocol) && url.hostname !== "",
  );
}

export function webOriginOf(input: string): Option<string> {
  return webUrlOf(input).map((url) => url.origin);
}

export function sitePatternOf(origin: string): Option<string> {
  return webUrlOf(origin).map((url) => `${url.protocol}//${url.hostname}/*`);
}

export function remotePatternOf(baseUrl: string): Option<string> {
  return webUrlOf(baseUrl)
    .filter((url) => url.protocol !== "http:" || !isLocalHost(url.hostname))
    .flatMap((url) => sitePatternOf(url.origin));
}

export function extensionOriginOf(extensionId: string): string {
  return `chrome-extension://${extensionId}`;
}
