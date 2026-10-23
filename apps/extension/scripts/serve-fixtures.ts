import { join, normalize, resolve } from "node:path";

const PORT = 4173;

const ROOTS = [
  resolve(import.meta.dir, "../../../packages/translation/fixtures"),
  resolve(import.meta.dir, "../proof"),
];

const STRICT_CSP = "default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'";

const HEADERS: Record<string, HeadersInit> = {
  "strict-csp.html": { "Content-Security-Policy": STRICT_CSP },
};

function decoded(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}

async function find(pathname: string): Promise<Response | undefined> {
  const path = decoded(pathname);

  if (path === undefined) return undefined;

  const relative = normalize(path).replace(/^([/\\]|\.\.)+/, "");

  for (const root of ROOTS) {
    const candidate = join(root, relative === "" ? "index.html" : relative);

    if (!candidate.startsWith(root)) continue;

    const file = Bun.file(candidate);

    if (await file.exists()) return new Response(file, { headers: HEADERS[relative] });
  }

  return undefined;
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const found = await find(new URL(request.url).pathname);

    return found ?? new Response("Not found", { status: 404 });
  },
});

console.log(`Fixtures on ${server.url.href}`);
