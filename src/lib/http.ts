import { isIP } from "node:net";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Basic SSRF guard: only public hostnames, never IP literals / internal TLDs. */
export function assertPublicHost(host: string): void {
  const h = host.toLowerCase();
  if (
    isIP(h) ||
    h.includes(":") ||
    !h.includes(".") ||
    /\.(local|localhost|internal|lan|home|corp)$/.test(h)
  ) {
    throw new Error("Only public domain names are allowed.");
  }
}

export interface FetchResult {
  ok: boolean;
  status: number;
  url: string;
  headers: Headers;
  body: Buffer;
  blocked: boolean;
  error?: string;
  text: () => string;
}

interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  accept?: string;
}

async function readLimited(res: Response, maxBytes: number): Promise<Buffer> {
  if (!res.body) return Buffer.from(await res.arrayBuffer()).subarray(0, maxBytes);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  return Buffer.concat(chunks);
}

function detectBlocked(status: number, body: Buffer): boolean {
  if (status === 401 || status === 403 || status === 429) return true;
  const head = body.subarray(0, 6000).toString("utf8").toLowerCase();
  return (
    head.includes("just a moment...") ||
    head.includes("attention required! | cloudflare") ||
    head.includes("cf-chl-") ||
    (status === 503 && head.includes("cloudflare"))
  );
}

function failure(url: string, error: string): FetchResult {
  return {
    ok: false,
    status: 0,
    url,
    headers: new Headers(),
    body: Buffer.alloc(0),
    blocked: false,
    error,
    text: () => "",
  };
}

/** Fetch with browser-like headers, timeout, size cap and SSRF guard. */
export async function fetchRaw(
  url: string,
  opts: FetchOptions = {},
): Promise<FetchResult> {
  const { timeoutMs = 10000, maxBytes = 4 * 1024 * 1024, accept } = opts;
  try {
    assertPublicHost(new URL(url).hostname);
    const res = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": BROWSER_UA,
        accept:
          accept ??
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    assertPublicHost(new URL(res.url || url).hostname);
    const body = await readLimited(res, maxBytes);
    const blocked = detectBlocked(res.status, body);
    return {
      ok: res.ok && !blocked,
      status: res.status,
      url: res.url || url,
      headers: res.headers,
      body,
      blocked,
      text: () => body.toString("utf8"),
    };
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.name === "TimeoutError"
          ? "Request timed out"
          : e.message
        : "Request failed";
    return failure(url, msg);
  }
}

/** Tries https://domain/path, then https://www.domain/path on network failure. */
export async function fetchFromDomain(
  domain: string,
  path: string,
  opts: FetchOptions = {},
): Promise<FetchResult> {
  const first = await fetchRaw(`https://${domain}${path}`, opts);
  if (first.status !== 0) return first;
  const second = await fetchRaw(`https://www.${domain}${path}`, opts);
  return second.status !== 0 ? second : first;
}
