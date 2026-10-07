import { XMLParser } from "fast-xml-parser";
import { gunzipSync } from "node:zlib";
import { fetchFromDomain, fetchRaw } from "./http";
import { classifyMoney, keywordTokens, matchesKeyword } from "./money";
import type { MoneyType, SitemapResult, SitemapUrl } from "./types";

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  trimValues: true,
});

const MAX_SITEMAP_FILES = 80;
const MAX_URLS = 150_000;
const TIME_BUDGET_MS = 40_000;
const BATCH = 6;

type Kind = "post" | "page" | "category" | "tag" | "author" | "product" | "media" | "other";

interface Entry {
  loc: string;
  lastmod?: string;
  kind: Kind;
}

type Parsed =
  | { type: "index"; children: { loc: string; lastmod?: string }[] }
  | { type: "urlset"; urls: { loc: string; lastmod?: string }[] }
  | { type: "error" };

function arr<T>(v: T | T[] | undefined): T[] {
  return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
}

function sitemapKind(url: string): Kind {
  let name = url;
  try {
    name = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
  } catch {
    /* keep raw */
  }
  const tokens = name
    .toLowerCase()
    .replace(/\.xml(\.gz)?$/, "")
    .split(/[^a-z]+/)
    .filter(Boolean);
  const has = (...w: string[]) => w.some((x) => tokens.includes(x));
  if (has("category", "categories", "taxonomy", "taxonomies")) return "category";
  if (has("tag", "tags")) return "tag";
  if (has("author", "authors", "user", "users")) return "author";
  if (has("product", "products")) return "product";
  if (has("page", "pages")) return "page";
  if (has("attachment", "media", "image", "images", "video", "videos")) return "media";
  if (has("post", "posts", "article", "articles", "blog", "news", "story", "stories")) return "post";
  return "other";
}

function isLikelyArticle(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path === "/" || path === "") return false;
    if (/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|mp3|xml|css|js)$/.test(path)) return false;
    if (
      /\/(category|categories|tag|tags|author|authors|page|feed|cart|checkout|my-account|wp-content|wp-json|search|cdn-cgi|login)(\/|$)/.test(
        path,
      )
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function parseSitemap(url: string): Promise<Parsed> {
  const r = await fetchRaw(url, {
    timeoutMs: 12_000,
    maxBytes: 25 * 1024 * 1024,
    accept: "application/xml,text/xml,*/*;q=0.8",
  });
  if (!r.ok || r.body.length === 0) return { type: "error" };
  let buf = r.body;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      buf = gunzipSync(buf);
    } catch {
      return { type: "error" };
    }
  }
  const text = buf.toString("utf8");
  if (!text.includes("<urlset") && !text.includes("<sitemapindex")) return { type: "error" };
  try {
    const doc = parser.parse(text) as {
      sitemapindex?: { sitemap?: { loc?: string; lastmod?: string } | { loc?: string; lastmod?: string }[] };
      urlset?: { url?: { loc?: string; lastmod?: string } | { loc?: string; lastmod?: string }[] };
    };
    if (doc.sitemapindex) {
      const children = arr(doc.sitemapindex.sitemap)
        .filter((s) => typeof s.loc === "string")
        .map((s) => ({ loc: String(s.loc), lastmod: s.lastmod ? String(s.lastmod) : undefined }));
      return { type: "index", children };
    }
    if (doc.urlset) {
      const urls = arr(doc.urlset.url)
        .filter((u) => typeof u.loc === "string")
        .map((u) => ({ loc: String(u.loc), lastmod: u.lastmod ? String(u.lastmod) : undefined }));
      return { type: "urlset", urls };
    }
  } catch {
    /* fall through */
  }
  return { type: "error" };
}

async function robotsSitemaps(domain: string): Promise<string[]> {
  const r = await fetchFromDomain(domain, "/robots.txt", {
    timeoutMs: 8000,
    maxBytes: 512 * 1024,
    accept: "text/plain,*/*",
  });
  if (!r.ok) return [];
  const out: string[] = [];
  for (const line of r.text().split(/\r?\n/)) {
    const m = /^\s*sitemap:\s*(\S+)/i.exec(line);
    if (m) out.push(m[1]);
  }
  return [...new Set(out)];
}

const DEFAULT_PATHS = [
  "/sitemap_index.xml",
  "/sitemap.xml",
  "/wp-sitemap.xml",
  "/sitemap-index.xml",
  "/sitemap/sitemap.xml",
  "/sitemap.xml.gz",
];

async function findDefaultSitemap(domain: string): Promise<string | undefined> {
  for (const host of [domain, `www.${domain}`]) {
    const results = await Promise.all(
      DEFAULT_PATHS.map(async (p) => {
        const url = `https://${host}${p}`;
        const parsed = await parseSitemap(url);
        return parsed.type === "error" ? undefined : url;
      }),
    );
    const hit = results.find(Boolean);
    if (hit) return hit;
  }
  return undefined;
}

export async function analyzeSitemap(domain: string, keyword?: string): Promise<SitemapResult> {
  const started = Date.now();
  const empty: SitemapResult = {
    domain,
    found: false,
    sitemapUrls: [],
    sitemapFiles: 0,
    breakdown: [],
    totalUrls: 0,
    articleCount: 0,
    pageCount: 0,
    productCount: 0,
    moneyCount: 0,
    moneyByType: {},
    moneyUrls: [],
    keyword,
    keywordMatchCount: 0,
    keywordUrls: [],
    recency: { last30: 0, last90: 0, last365: 0, datedUrls: 0 },
    truncated: false,
  };

  let roots = await robotsSitemaps(domain);
  if (roots.length === 0) {
    const guess = await findDefaultSitemap(domain);
    if (guess) roots = [guess];
  }
  if (roots.length === 0) {
    return {
      ...empty,
      note: "No sitemap found. The site may not publish one or may block automated requests.",
    };
  }

  const entries: Entry[] = [];
  const seen = new Set<string>();
  const visited = new Set<string>();
  const breakdown: SitemapResult["breakdown"] = [];
  let files = 0;
  let truncated = false;
  const queue: { url: string; depth: number }[] = roots.map((url) => ({ url, depth: 0 }));
  const goodRoots: string[] = [];

  while (queue.length > 0) {
    if (Date.now() - started > TIME_BUDGET_MS || files >= MAX_SITEMAP_FILES || entries.length >= MAX_URLS) {
      truncated = true;
      break;
    }
    const batch = queue.splice(0, BATCH).filter((q) => !visited.has(q.url));
    batch.forEach((q) => visited.add(q.url));
    const results = await Promise.all(batch.map(async (q) => ({ q, parsed: await parseSitemap(q.url) })));

    for (const { q, parsed } of results) {
      if (parsed.type === "error") continue;
      files++;
      if (q.depth === 0) goodRoots.push(q.url);
      if (parsed.type === "index") {
        if (q.depth < 3) {
          for (const c of parsed.children) {
            if (sitemapKind(c.loc) === "media") continue;
            queue.push({ url: c.loc, depth: q.depth + 1 });
          }
        }
      } else {
        const kind = sitemapKind(q.url);
        let count = 0;
        for (const u of parsed.urls) {
          if (seen.has(u.loc)) continue;
          seen.add(u.loc);
          entries.push({ loc: u.loc, lastmod: u.lastmod, kind });
          count++;
        }
        let name = q.url;
        try {
          name = new URL(q.url).pathname.split("/").filter(Boolean).pop() ?? q.url;
        } catch {
          /* ignore */
        }
        if (breakdown.length < 40) breakdown.push({ name, kind, count });
      }
    }
  }

  if (entries.length === 0) {
    return { ...empty, sitemapUrls: goodRoots, note: "Sitemap was found but contained no URLs." };
  }

  const kwTokens = keywordTokens(keyword ?? "");
  const now = Date.now();
  const DAY = 86_400_000;

  let articleCount = 0;
  let pageCount = 0;
  let productCount = 0;
  let moneyCount = 0;
  let keywordMatchCount = 0;
  const moneyByType: Partial<Record<MoneyType, number>> = {};
  const moneyUrls: SitemapUrl[] = [];
  const keywordUrls: SitemapUrl[] = [];
  const recency = { last30: 0, last90: 0, last365: 0, latest: undefined as string | undefined, datedUrls: 0 };
  let latestTs = 0;

  for (const e of entries) {
    if (e.kind === "page") pageCount++;
    if (e.kind === "product") productCount++;
    const isArticleKind = e.kind === "post" || e.kind === "other";
    if (!isArticleKind || !isLikelyArticle(e.loc)) continue;
    articleCount++;

    const moneyType = classifyMoney(e.loc);
    if (moneyType) {
      moneyCount++;
      moneyByType[moneyType] = (moneyByType[moneyType] ?? 0) + 1;
      moneyUrls.push({ url: e.loc, lastmod: e.lastmod, moneyType });
    }
    if (kwTokens.length && matchesKeyword(e.loc, kwTokens)) {
      keywordMatchCount++;
      if (keywordUrls.length < 50) keywordUrls.push({ url: e.loc, lastmod: e.lastmod, moneyType });
    }
    if (e.lastmod) {
      const ts = Date.parse(e.lastmod);
      if (!Number.isNaN(ts)) {
        recency.datedUrls++;
        const age = now - ts;
        if (age <= 30 * DAY) recency.last30++;
        if (age <= 90 * DAY) recency.last90++;
        if (age <= 365 * DAY) recency.last365++;
        if (ts > latestTs) latestTs = ts;
      }
    }
  }
  if (latestTs) recency.latest = new Date(latestTs).toISOString();

  moneyUrls.sort((a, b) => (Date.parse(b.lastmod ?? "") || 0) - (Date.parse(a.lastmod ?? "") || 0));

  return {
    ...empty,
    found: true,
    sitemapUrls: goodRoots,
    sitemapFiles: files,
    breakdown,
    totalUrls: entries.length,
    articleCount,
    pageCount,
    productCount,
    moneyCount,
    moneyByType,
    moneyUrls: moneyUrls.slice(0, 300),
    keywordMatchCount,
    keywordUrls,
    recency,
    truncated,
    note: truncated ? "Sitemap is very large - counts are partial (time/size limit reached)." : undefined,
  };
}
