import type {
  ArticleMetrics,
  SitemapResult,
  SiteResult,
  StepStatus,
  WhoisResult,
} from "@/lib/types";

export type StepKey = "whois" | "site" | "sitemap" | "articles";

export interface DomainState {
  domain: string;
  whois?: WhoisResult;
  site?: SiteResult;
  sitemap?: SitemapResult;
  articles: ArticleMetrics[];
  /** How many articles we plan to fetch (for progress display). */
  articlesPlanned: number;
  status: Record<StepKey, StepStatus>;
  errors: Partial<Record<StepKey, string>>;
}

export function emptyDomainState(domain: string): DomainState {
  return {
    domain,
    articles: [],
    articlesPlanned: 0,
    status: { whois: "loading", site: "loading", sitemap: "loading", articles: "idle" },
    errors: {},
  };
}
