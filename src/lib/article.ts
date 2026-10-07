import * as cheerio from "cheerio";
import { fetchRaw } from "./http";
import { AFFILIATE_RE, countWords, extractSchema } from "./html";
import type { ArticleMetrics } from "./types";

const CONTENT_SELECTORS = [
  ".entry-content",
  ".post-content",
  ".article-content",
  ".single-content",
  "[itemprop='articleBody']",
  "article",
  "main",
  "#content",
];

const NOISE =
  "script,style,noscript,nav,header,footer,aside,form,iframe,svg,.comments,#comments,.sidebar,.widget,.related-posts,.breadcrumb,.breadcrumbs,[class*='share'],[class*='newsletter']";

function sameSite(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export async function analyzeArticle(url: string, domain: string): Promise<ArticleMetrics> {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (!sameSite(host, domain)) return { url, error: "URL does not belong to this domain" };
  } catch {
    return { url, error: "Invalid URL" };
  }

  const r = await fetchRaw(url, { timeoutMs: 12_000 });
  if (!r.ok) {
    return {
      url,
      blocked: r.blocked,
      error: r.blocked ? "Blocked by bot protection" : r.error ?? `HTTP ${r.status}`,
    };
  }

  const $ = cheerio.load(r.text());
  const schema = extractSchema($);

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() || $("title").first().text().trim() || undefined;
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim() || undefined;
  const published =
    $('meta[property="article:published_time"]').attr("content") ||
    schema.published ||
    $("time[datetime]").first().attr("datetime") ||
    undefined;
  const modified = $('meta[property="article:modified_time"]').attr("content") || schema.modified || undefined;

  $(NOISE).remove();

  let root: ReturnType<typeof $> = $("body");
  for (const sel of CONTENT_SELECTORS) {
    const el = $(sel).first();
    if (el.length && countWords(el.text()) >= 150) {
      root = el;
      break;
    }
  }

  const wordCount = countWords(root.text());
  const origin = new URL(r.url);
  let internalLinks = 0;
  let externalLinks = 0;
  let affiliateLinks = 0;
  root.find("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const rel = ($(el).attr("rel") ?? "").toLowerCase();
    if (AFFILIATE_RE.test(href) || rel.includes("sponsored")) affiliateLinks++;
    try {
      const u = new URL(href, origin);
      if (!/^https?:$/.test(u.protocol)) return;
      if (sameSite(u.hostname.replace(/^www\./, ""), domain)) internalLinks++;
      else externalLinks++;
    } catch {
      /* ignore malformed href */
    }
  });

  return {
    url,
    title,
    h1,
    wordCount,
    h2: root.find("h2").length,
    h3: root.find("h3").length,
    images: root.find("img").length,
    tables: root.find("table").length,
    internalLinks,
    externalLinks,
    affiliateLinks,
    schemaTypes: schema.types.slice(0, 8),
    published,
    modified,
  };
}
