export const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1"];

export const LOCAL_HOSTS = LOCAL_HOSTNAMES.map((hostname) => `http://${hostname}/*`);

export const OPTIONAL_HOSTS = ["https://*/*", "http://*/*"];

export const YOUTUBE_MATCHES = ["https://www.youtube.com/*"];

export const PAGE_SCRIPT = "/content-scripts/content.js";

export const YOUTUBE_SCRIPT = "/content-scripts/youtube.js";

export const YOUTUBE_MAIN_SCRIPT = "/content-scripts/youtube-timedtext.js";

export const YOUTUBE_CSS = "/content-scripts/youtube.css";
