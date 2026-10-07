/** Shared types used by API routes (server) and UI (client). */

export type StepStatus = "idle" | "loading" | "done" | "error";

export interface WhoisResult {
  domain: string;
  registrableDomain: string;
  registered?: string;
  expires?: string;
  updated?: string;
  registrar?: string;
  nameservers: string[];
  status: string[];
  /** First time the Wayback Machine saw this domain (ISO date). */
  firstArchived?: string;
  rdapAvailable: boolean;
  note?: string;
}

export interface SiteResult {
  domain: string;
  finalUrl: string;
  statusCode: number;
  blocked: boolean;
  error?: string;
  title?: string;
  description?: string;
  cms?: string;
  server?: string;
  lang?: string;
  adNetwork?: string;
  /** Mediavine / Raptive style networks require large traffic -> strong signal. */
  premiumAds: boolean;
  affiliateLinks: number;
  trust: {
    about: boolean;
    contact: boolean;
    privacy: boolean;
    disclosure: boolean;
    terms: boolean;
  };
  socials: string[];
  navItems: string[];
  schemaTypes: string[];
}

export type MoneyType =
  | "best"
  | "top"
  | "review"
  | "vs"
  | "guide"
  | "alternatives";

export interface SitemapUrl {
  url: string;
  lastmod?: string;
  moneyType?: MoneyType;
}

export interface SitemapResult {
  domain: string;
  found: boolean;
  sitemapUrls: string[];
  sitemapFiles: number;
  breakdown: { name: string; kind: string; count: number }[];
  totalUrls: number;
  articleCount: number;
  pageCount: number;
  productCount: number;
  moneyCount: number;
  moneyByType: Partial<Record<MoneyType, number>>;
  moneyUrls: SitemapUrl[];
  keyword?: string;
  keywordMatchCount: number;
  keywordUrls: SitemapUrl[];
  recency: {
    last30: number;
    last90: number;
    last365: number;
    latest?: string;
    datedUrls: number;
  };
  truncated: boolean;
  note?: string;
}

export interface ArticleMetrics {
  url: string;
  error?: string;
  title?: string;
  h1?: string;
  wordCount?: number;
  h2?: number;
  h3?: number;
  images?: number;
  tables?: number;
  internalLinks?: number;
  externalLinks?: number;
  affiliateLinks?: number;
  schemaTypes?: string[];
  published?: string;
  modified?: string;
  blocked?: boolean;
}
