import type { ArticleMetrics, SitemapResult, SiteResult, WhoisResult } from "./types";

export interface ScoreInput {
  whois?: WhoisResult;
  site?: SiteResult;
  sitemap?: SitemapResult;
  articles: ArticleMetrics[];
}

export type Tone = "good" | "warn" | "bad";

export interface Reason {
  text: string;
  /** "pos" = good news for you (weaker competitor), "neg" = bad news. */
  impact: "pos" | "neg" | "neutral";
}

export interface ScoreResult {
  /** 0-100, higher = stronger competitor. null when there is not enough data yet. */
  score: number | null;
  label: string;
  advice: string;
  tone: Tone;
  /** How much of the model was fed with real data (0-1). */
  coverage: number;
  reasons: Reason[];
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function domainAgeYears(whois?: WhoisResult): number | undefined {
  const iso = whois?.registered ?? whois?.firstArchived;
  if (!iso) return undefined;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return undefined;
  return (Date.now() - ts) / (365.25 * 86_400_000);
}

export function formatAge(years?: number): string {
  if (years === undefined) return "—";
  if (years < 1) return `${Math.max(1, Math.round(years * 12))} mo`;
  const y = Math.floor(years);
  const m = Math.round((years - y) * 12);
  return m === 0 || y >= 5 ? `${y} yr` : `${y} yr ${m} mo`;
}

export function successfulArticles(articles: ArticleMetrics[]): ArticleMetrics[] {
  return articles.filter((a) => typeof a.wordCount === "number");
}

export function averageWords(articles: ArticleMetrics[]): number | undefined {
  const ok = successfulArticles(articles);
  if (ok.length === 0) return undefined;
  return Math.round(ok.reduce((s, a) => s + (a.wordCount ?? 0), 0) / ok.length);
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

interface Component {
  value: number;
  weight: number;
}

export function computeScore(input: ScoreInput): ScoreResult {
  const { whois, site, sitemap, articles } = input;
  const comps: Component[] = [];
  const reasons: Reason[] = [];

  const years = domainAgeYears(whois);
  if (years !== undefined) {
    comps.push({ value: clamp(years / 6), weight: 20 });
    reasons.push({
      text: `Domain age is ${formatAge(years)}`,
      impact: years < 1.5 ? "pos" : years >= 5 ? "neg" : "neutral",
    });
  }

  if (sitemap?.found) {
    comps.push({ value: clamp(sitemap.articleCount / 600), weight: 20 });
    reasons.push({
      text: `${sitemap.articleCount.toLocaleString()} articles published`,
      impact: sitemap.articleCount < 60 ? "pos" : sitemap.articleCount >= 400 ? "neg" : "neutral",
    });

    comps.push({ value: clamp(sitemap.moneyCount / 60), weight: 20 });
    reasons.push({
      text: `${sitemap.moneyCount.toLocaleString()} money-style pages (best / review / vs)`,
      impact: sitemap.moneyCount < 8 ? "pos" : sitemap.moneyCount >= 40 ? "neg" : "neutral",
    });

    if (sitemap.recency.datedUrls > 0) {
      comps.push({ value: clamp(sitemap.recency.last90 / 40), weight: 10 });
      reasons.push({
        text: `${sitemap.recency.last90} pages updated in the last 90 days`,
        impact: sitemap.recency.last90 < 3 ? "pos" : sitemap.recency.last90 >= 25 ? "neg" : "neutral",
      });
    }
  }

  const ok = successfulArticles(articles);
  const words = averageWords(articles);
  if (words !== undefined) {
    comps.push({ value: clamp(words / 3000), weight: 15 });
    reasons.push({
      text: `Sampled money pages average ${words.toLocaleString()} words`,
      impact: words < 1200 ? "pos" : words >= 2500 ? "neg" : "neutral",
    });

    const schemaShare = ok.filter((a) =>
      (a.schemaTypes ?? []).some((t) => /review|product|faq|itemlist|howto/i.test(t)),
    ).length / ok.length;
    const quality =
      clamp(avg(ok.map((a) => a.images ?? 0)) / 10) * 0.4 +
      schemaShare * 0.3 +
      clamp(avg(ok.map((a) => a.h2 ?? 0)) / 12) * 0.3;
    comps.push({ value: quality, weight: 5 });
  }

  if (site && !site.error) {
    const trustCount = Object.values(site.trust).filter(Boolean).length;
    const adValue = site.premiumAds ? 0.5 : site.adNetwork ? 0.15 : 0;
    comps.push({ value: clamp((trustCount / 5) * 0.5 + adValue), weight: 10 });
    if (site.premiumAds) {
      reasons.push({
        text: `Runs ${site.adNetwork} - these networks need large traffic`,
        impact: "neg",
      });
    }
  }

  const totalWeight = comps.reduce((s, c) => s + c.weight, 0);
  const coverage = totalWeight / 100;
  if (comps.length < 3 || totalWeight < 40) {
    return {
      score: null,
      label: "Collecting data…",
      advice: "Not enough data yet to judge this competitor.",
      tone: "warn",
      coverage,
      reasons,
    };
  }

  const score = Math.round((comps.reduce((s, c) => s + c.value * c.weight, 0) / totalWeight) * 100);

  let label: string;
  let advice: string;
  let tone: Tone;
  if (score < 30) {
    label = "Weak competitor";
    advice = "Looks beatable - good opportunity if backlinks are also low.";
    tone = "good";
  } else if (score < 55) {
    label = "Moderate competitor";
    advice = "Winnable with better, deeper content and a solid on-page setup.";
    tone = "warn";
  } else if (score < 75) {
    label = "Strong competitor";
    advice = "Established site. You'd need standout content and links to compete.";
    tone = "bad";
  } else {
    label = "Very strong competitor";
    advice = "Authority site. Skip unless you have a unique angle or long-tail variant.";
    tone = "bad";
  }

  return { score, label, advice, tone, coverage, reasons };
}
