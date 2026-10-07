"use client";

import { useCallback, useRef, useState } from "react";
import { parseDomainList } from "@/lib/domain";
import { csvEscape } from "@/lib/format";
import { averageWords, computeScore, domainAgeYears, formatAge } from "@/lib/score";
import type { ArticleMetrics, SitemapResult, SiteResult, WhoisResult } from "@/lib/types";
import ComparisonTable from "./ComparisonTable";
import DomainReport from "./DomainReport";
import { DomainState, StepKey, emptyDomainState } from "./state";

const SAMPLE_OPTIONS = [5, 10, 15, 20];
const CHUNK = 5;
const EXAMPLES = ["wirecutter.com", "tomsguide.com", "vacuumwars.com"];

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return (await res.json()) as T;
}

/** Keyword-matching pages first, then an even spread of the remaining money pages. */
function pickUrls(sm: SitemapResult, count: number): string[] {
  const picked: string[] = sm.keywordUrls.slice(0, Math.ceil(count / 2)).map((u) => u.url);
  const taken = new Set(picked);
  const rest = sm.moneyUrls.filter((u) => !taken.has(u.url));
  const need = Math.min(count - picked.length, rest.length);
  for (let i = 0; i < need; i++) {
    picked.push(rest[Math.floor((i * rest.length) / need)].url);
  }
  return [...new Set(picked)];
}

export default function AnalyzerApp() {
  const [keyword, setKeyword] = useState("");
  const [input, setInput] = useState("");
  const [sample, setSample] = useState(10);
  const [formError, setFormError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<DomainState[]>([]);
  const runId = useRef(0);

  const patch = useCallback((id: number, domain: string, fn: (s: DomainState) => DomainState) => {
    if (runId.current !== id) return;
    setResults((prev) => prev.map((r) => (r.domain === domain ? fn(r) : r)));
  }, []);

  const setStep = useCallback(
    (id: number, domain: string, step: StepKey, status: "done" | "error" | "loading", error?: string) => {
      patch(id, domain, (s) => ({
        ...s,
        status: { ...s.status, [step]: status },
        errors: error ? { ...s.errors, [step]: error } : s.errors,
      }));
    },
    [patch],
  );

  const analyzeDomain = useCallback(
    async (id: number, domain: string, kw: string, sampleSize: number) => {
      const q = encodeURIComponent(domain);
      const message = (e: unknown) => (e instanceof Error ? e.message : "Request failed");

      const whois = getJson<WhoisResult>(`/api/whois?domain=${q}`)
        .then((whoisData) => {
          patch(id, domain, (s) => ({ ...s, whois: whoisData }));
          setStep(id, domain, "whois", "done");
        })
        .catch((e) => setStep(id, domain, "whois", "error", message(e)));

      const site = getJson<SiteResult>(`/api/site?domain=${q}`)
        .then((siteData) => {
          patch(id, domain, (s) => ({ ...s, site: siteData }));
          setStep(id, domain, "site", "done");
        })
        .catch((e) => setStep(id, domain, "site", "error", message(e)));

      const sitemap = (async () => {
        let sm: SitemapResult;
        try {
          sm = await getJson<SitemapResult>(`/api/sitemap?domain=${q}&keyword=${encodeURIComponent(kw)}`);
        } catch (e) {
          setStep(id, domain, "sitemap", "error", message(e));
          return;
        }
        patch(id, domain, (s) => ({ ...s, sitemap: sm }));
        setStep(id, domain, "sitemap", "done");

        const urls = pickUrls(sm, sampleSize);
        if (urls.length === 0) {
          setStep(id, domain, "articles", "done");
          return;
        }
        patch(id, domain, (s) => ({
          ...s,
          articlesPlanned: urls.length,
          status: { ...s.status, articles: "loading" },
        }));
        const chunks: string[][] = [];
        for (let i = 0; i < urls.length; i += CHUNK) chunks.push(urls.slice(i, i + CHUNK));
        await Promise.all(
          chunks.map(async (chunk) => {
            try {
              const res = await fetch("/api/articles", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ domain, urls: chunk }),
              });
              if (!res.ok) throw new Error(`Server returned ${res.status}`);
              const data = (await res.json()) as { results: ArticleMetrics[] };
              patch(id, domain, (s) => ({ ...s, articles: [...s.articles, ...data.results] }));
            } catch (e) {
              const failed = chunk.map((url) => ({ url, error: message(e) }));
              patch(id, domain, (s) => ({ ...s, articles: [...s.articles, ...failed] }));
            }
          }),
        );
        setStep(id, domain, "articles", "done");
      })();

      await Promise.allSettled([whois, site, sitemap]);
    },
    [patch, setStep],
  );

  const analyze = useCallback(async () => {
    const domains = parseDomainList(input);
    if (domains.length === 0) {
      setFormError("Enter at least one valid competitor domain, e.g. example.com");
      return;
    }
    setFormError(null);
    const id = ++runId.current;
    setResults(domains.map(emptyDomainState));
    setRunning(true);
    await Promise.all(domains.map((d) => analyzeDomain(id, d, keyword.trim(), sample)));
    if (runId.current === id) setRunning(false);
  }, [analyzeDomain, input, keyword, sample]);

  const exportCsv = useCallback(() => {
    const header = [
      "Domain", "Score", "Verdict", "Age", "Registered", "Total URLs", "Articles",
      "Money pages", "Avg words (sampled)", "Updated last 90d", "CMS", "Ad network",
    ];
    const rows = results.map((r) => {
      const sc = computeScore(r);
      return [
        r.domain,
        sc.score ?? "",
        sc.label,
        formatAge(domainAgeYears(r.whois)),
        r.whois?.registered?.slice(0, 10) ?? r.whois?.firstArchived ?? "",
        r.sitemap?.totalUrls ?? "",
        r.sitemap?.articleCount ?? "",
        r.sitemap?.moneyCount ?? "",
        averageWords(r.articles) ?? "",
        r.sitemap?.recency.last90 ?? "",
        r.site?.cms ?? "",
        r.site?.adNetwork ?? "",
      ].map(csvEscape).join(",");
    });
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `competitor-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [results]);

  return (
    <>
      <div className="bg-glow" aria-hidden="true" />

      <header className="hero">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">◎</span>
          <span className="brand-name">RankScout</span>
          <span className="pill pill-free">100% free · no API keys</span>
        </div>
        <h1>
          Know if a keyword is <span className="grad-text">worth chasing</span> in seconds
        </h1>
        <p className="hero-sub">
          Paste competitor sites. Get domain age, total articles, money pages, word counts and a
          competition score - without opening ten tabs.
        </p>
      </header>

      <section className="panel input-panel" aria-label="Analyze competitors">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void analyze();
          }}
        >
          <div className="field">
            <label htmlFor="keyword">
              Target keyword <span className="optional">optional</span>
            </label>
            <input
              id="keyword"
              type="text"
              placeholder="e.g. best cordless vacuum cleaner"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              autoComplete="off"
            />
            <small>Finds competitor pages already targeting this keyword and analyzes them first.</small>
          </div>

          <div className="field">
            <label htmlFor="domains">Competitor domains</label>
            <textarea
              id="domains"
              rows={3}
              placeholder={"example.com\nanother-site.com\n(up to 5, separated by new lines or commas)"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <div className="examples">
              <span>Try:</span>
              {EXAMPLES.map((ex) => (
                <button type="button" key={ex} className="chip" onClick={() => setInput(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <div className="field field-inline">
              <label htmlFor="sample">Pages to sample per site</label>
              <select id="sample" value={sample} onChange={(e) => setSample(Number(e.target.value))}>
                {SAMPLE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} pages
                  </option>
                ))}
              </select>
            </div>
            <button id="analyze-btn" type="submit" className="btn-primary" disabled={running}>
              {running ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Analyzing…
                </>
              ) : (
                "Analyze competitors →"
              )}
            </button>
          </div>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
        </form>
      </section>

      {results.length > 0 && (
        <section className="results" aria-live="polite">
          {results.length > 1 && (
            <ComparisonTable results={results} onExport={exportCsv} />
          )}
          {results.map((r) => (
            <DomainReport key={r.domain} state={r} keyword={keyword.trim()} />
          ))}
        </section>
      )}

      <footer className="footer">
        <p>
          Scores are a heuristic built from free public data (RDAP, sitemaps, page HTML). They do not
          include backlinks - always sanity-check authority before you commit to a keyword.
        </p>
      </footer>
    </>
  );
}
