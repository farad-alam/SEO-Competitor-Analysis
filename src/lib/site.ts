import * as cheerio from "cheerio";
import { fetchFromDomain } from "./http";
import { AFFILIATE_RE, extractSchema } from "./html";
import type { SiteResult } from "./types";

const AD_NETWORKS: { re: RegExp; name: string; premium?: boolean }[] = [
  { re: /mediavine/i, name: "Mediavine", premium: true },
  { re: /adthrive|raptive/i, name: "Raptive (AdThrive)", premium: true },
  { re: /ezoic/i, name: "Ezoic" },
  { re: /monumetric/i, name: "Monumetric" },
  { re: /googlesyndication|adsbygoogle/i, name: "Google AdSense" },
];

function detectCms(html: string, generator: string): string | undefined {
  const g = generator.toLowerCase();
  if (/wordpress/.test(g) || /wp-content|wp-includes/.test(html)) return "WordPress";
  if (/cdn\.shopify\.com/.test(html)) return "Shopify";
  if (/wixstatic\.com|wix\.com/.test(html)) return "Wix";
  if (/squarespace/.test(html) || /squarespace/.test(g)) return "Squarespace";
  if (/ghost/.test(g)) return "Ghost";
  if (/webflow/.test(html) || /webflow/.test(g)) return "Webflow";
  if (/blogger/.test(g)) return "Blogger";
  if (/\/_next\//.test(html)) return "Next.js";
  if (/framer/.test(g)) return "Framer";
  return undefined;
}

export async function analyzeSite(domain: string): Promise<SiteResult> {
  const r = await fetchFromDomain(domain, "/", { timeoutMs: 12_000 });
  const base: SiteResult = {
    domain,
    finalUrl: r.url,
    statusCode: r.status,
    blocked: r.blocked,
    premiumAds: false,
    affiliateLinks: 0,
    trust: { about: false, contact: false, privacy: false, disclosure: false, terms: false },
    socials: [],
    navItems: [],
    schemaTypes: [],
    server: r.headers.get("server") ?? undefined,
  };

  if (!r.ok) {
    return {
      ...base,
      error: r.blocked
        ? "Site blocked the request (bot protection). Page-level data may be incomplete."
        : r.error ?? `HTTP ${r.status}`,
    };
  }

  const html = r.text();
  const $ = cheerio.load(html);
  const generator = $('meta[name="generator"]').attr("content") ?? "";

  const ad = AD_NETWORKS.find((a) => a.re.test(html));
  const hrefs: { href: string; text: string }[] = [];
  $("a[href]").each((_, el) => {
    hrefs.push({ href: ($(el).attr("href") ?? "").toLowerCase(), text: $(el).text().toLowerCase().trim() });
  });
  const linkHas = (re: RegExp) => hrefs.some((h) => re.test(h.href) || re.test(h.text));

  const socials = new Set<string>();
  for (const h of hrefs) {
    const m = /(facebook|twitter|x|instagram|pinterest|youtube|linkedin|tiktok)\.com/.exec(h.href);
    if (m && !/share|intent|sharer/.test(h.href)) socials.add(m[1]);
  }

  const navItems = new Set<string>();
  $("nav a, header a, .menu a").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length >= 3 && t.length <= 30) navItems.add(t);
  });

  return {
    ...base,
    finalUrl: r.url,
    title: $("title").first().text().trim() || undefined,
    description: $('meta[name="description"]').attr("content")?.trim(),
    cms: detectCms(html, generator),
    lang: $("html").attr("lang") ?? undefined,
    adNetwork: ad?.name,
    premiumAds: !!ad?.premium,
    affiliateLinks: hrefs.filter((h) => AFFILIATE_RE.test(h.href)).length,
    trust: {
      about: linkHas(/about/),
      contact: linkHas(/contact/),
      privacy: linkHas(/privacy/),
      disclosure: linkHas(/disclosure|affiliate-disclaimer/),
      terms: linkHas(/terms/),
    },
    socials: [...socials],
    navItems: [...navItems].slice(0, 12),
    schemaTypes: extractSchema($).types.slice(0, 10),
  };
}
