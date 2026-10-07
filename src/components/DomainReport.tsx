import { formatDate, formatNumber, shortPath } from "@/lib/format";
import { MONEY_LABELS, classifyMoney, keywordTokens, matchesKeyword } from "@/lib/money";
import { averageWords, computeScore, domainAgeYears, formatAge, successfulArticles } from "@/lib/score";
import type { MoneyType } from "@/lib/types";
import ScoreRing from "./ScoreRing";
import type { DomainState, StepKey } from "./state";

interface Props {
  state: DomainState;
  keyword: string;
}

const STEP_LABELS: Record<StepKey, string> = {
  whois: "WHOIS / age",
  site: "Homepage",
  sitemap: "Sitemap",
  articles: "Pages",
};

function Stat({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      {loading ? <span className="skeleton skeleton-lg" /> : <strong className="stat-value">{value}</strong>}
      {sub && !loading && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export default function DomainReport({ state, keyword }: Props) {
  const { domain, whois, site, sitemap, articles, status, errors } = state;
  const score = computeScore(state);
  const years = domainAgeYears(whois);
  const ok = successfulArticles(articles);
  const words = averageWords(articles);
  const longest = ok.length ? Math.max(...ok.map((a) => a.wordCount ?? 0)) : undefined;
  const kwTokens = keywordTokens(keyword);
  const sortedArticles = [...articles].sort((a, b) => (b.wordCount ?? -1) - (a.wordCount ?? -1));
  const pending = Math.max(0, state.articlesPlanned - articles.length);
  const moneyEntries = Object.entries(sitemap?.moneyByType ?? {}) as [MoneyType, number][];
  const maxMoney = Math.max(1, ...moneyEntries.map(([, n]) => n));
  const warnings = [
    ...Object.entries(errors).map(([k, v]) => `${STEP_LABELS[k as StepKey]}: ${v}`),
    whois?.note,
    site?.error,
    sitemap?.note,
  ].filter(Boolean) as string[];

  const registered = whois?.registered ?? whois?.firstArchived;

  return (
    <article className="panel report" id={`report-${domain}`}>
      <div className="report-head">
        <ScoreRing score={score.score} tone={score.tone} />
        <div className="report-title">
          <h2>
            <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer">
              {domain}
            </a>
          </h2>
          {site?.title && <p className="muted clamp">{site.title}</p>}
          <div className="verdict">
            <span className={`tone-text tone-${score.tone}`}>{score.label}</span>
            <span className="muted"> - {score.advice}</span>
          </div>
        </div>
      </div>

      <ol className="steps">
        {(Object.keys(STEP_LABELS) as StepKey[]).map((k) => (
          <li key={k} className={`step step-${status[k]}`}>
            <span className="step-dot" />
            {STEP_LABELS[k]}
            {k === "articles" && state.articlesPlanned > 0 && (
              <em>
                {" "}
                {Math.min(articles.length, state.articlesPlanned)}/{state.articlesPlanned}
              </em>
            )}
          </li>
        ))}
      </ol>

      {score.reasons.length > 0 && (
        <ul className="reasons">
          {score.reasons.map((r) => (
            <li key={r.text} className={`reason reason-${r.impact}`}>
              {r.text}
            </li>
          ))}
        </ul>
      )}

      <div className="stat-grid">
        <Stat
          label="Domain age"
          value={formatAge(years)}
          sub={registered ? `${whois?.registered ? "Registered" : "First archived"} ${formatDate(registered)}` : undefined}
          loading={status.whois === "loading"}
        />
        <Stat
          label="Expires"
          value={formatDate(whois?.expires)}
          sub={whois?.registrar}
          loading={status.whois === "loading"}
        />
        <Stat
          label="First seen (Wayback)"
          value={formatDate(whois?.firstArchived)}
          loading={status.whois === "loading"}
        />
        <Stat
          label="Total URLs"
          value={formatNumber(sitemap?.found ? sitemap.totalUrls : undefined)}
          sub={sitemap?.found ? `${sitemap.sitemapFiles} sitemap file(s)` : undefined}
          loading={status.sitemap === "loading"}
        />
        <Stat
          label="Articles"
          value={formatNumber(sitemap?.found ? sitemap.articleCount : undefined)}
          sub={sitemap?.found ? `${formatNumber(sitemap.pageCount)} pages · ${formatNumber(sitemap.productCount)} products` : undefined}
          loading={status.sitemap === "loading"}
        />
        <Stat
          label="Money pages"
          value={formatNumber(sitemap?.found ? sitemap.moneyCount : undefined)}
          sub={
            sitemap?.found && sitemap.articleCount > 0
              ? `${Math.round((sitemap.moneyCount / sitemap.articleCount) * 100)}% of articles`
              : undefined
          }
          loading={status.sitemap === "loading"}
        />
        <Stat
          label="Avg words (sampled)"
          value={formatNumber(words)}
          sub={longest ? `Longest ${formatNumber(longest)}` : undefined}
          loading={status.articles === "loading" && ok.length === 0}
        />
        <Stat
          label="Updated last 90 days"
          value={formatNumber(sitemap?.found && sitemap.recency.datedUrls ? sitemap.recency.last90 : undefined)}
          sub={sitemap?.recency.latest ? `Latest ${formatDate(sitemap.recency.latest)}` : undefined}
          loading={status.sitemap === "loading"}
        />
        <Stat
          label="Platform"
          value={site?.cms ?? "—"}
          sub={site?.adNetwork ? `Ads: ${site.adNetwork}` : site ? "No ad network found" : undefined}
          loading={status.site === "loading"}
        />
        {keyword && (
          <Stat
            label="Pages matching keyword"
            value={formatNumber(sitemap?.found ? sitemap.keywordMatchCount : undefined)}
            loading={status.sitemap === "loading"}
          />
        )}
      </div>

      {site && !site.error && (
        <div className="chips-row">
          <span className="chips-label">Trust signals</span>
          {Object.entries(site.trust).map(([k, v]) => (
            <span key={k} className={`chip-static ${v ? "chip-on" : "chip-off"}`}>
              {v ? "✓" : "✕"} {k}
            </span>
          ))}
          {site.affiliateLinks > 0 && <span className="chip-static chip-on">{site.affiliateLinks} affiliate links on homepage</span>}
          {site.socials.length > 0 && <span className="chip-static chip-neutral">{site.socials.join(" · ")}</span>}
        </div>
      )}

      {site && site.navItems.length > 0 && (
        <div className="chips-row">
          <span className="chips-label">Menu topics</span>
          {site.navItems.map((n) => (
            <span key={n} className="chip-static chip-neutral">
              {n}
            </span>
          ))}
        </div>
      )}

      {moneyEntries.length > 0 && (
        <div className="money-breakdown">
          <h3>Money page types</h3>
          {moneyEntries
            .sort((a, b) => b[1] - a[1])
            .map(([type, n]) => (
              <div key={type} className="bar-row">
                <span className="bar-label">{MONEY_LABELS[type]}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(n / maxMoney) * 100}%` }} />
                </span>
                <span className="bar-num">{n}</span>
              </div>
            ))}
        </div>
      )}

      {(status.articles !== "idle" || articles.length > 0) && (
        <div className="pages">
          <h3>Sampled pages</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Words</th>
                  <th>H2</th>
                  <th>Images</th>
                  <th>Tables</th>
                  <th>Aff. links</th>
                  <th>Published</th>
                </tr>
              </thead>
              <tbody>
                {sortedArticles.map((a) => {
                  const type = classifyMoney(a.url);
                  const kwHit = kwTokens.length > 0 && matchesKeyword(a.url, kwTokens);
                  return (
                    <tr key={a.url}>
                      <td className="cell-page">
                        <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.title ?? a.url}>
                          {a.h1 || a.title || shortPath(a.url)}
                        </a>
                        <span className="cell-sub">{shortPath(a.url)}</span>
                        <span className="badges">
                          {type && <span className="badge badge-money">{MONEY_LABELS[type]}</span>}
                          {kwHit && <span className="badge badge-kw">keyword match</span>}
                        </span>
                        {a.error && <span className="cell-error">{a.error}</span>}
                      </td>
                      <td className="cell-strong">{formatNumber(a.wordCount)}</td>
                      <td>{formatNumber(a.h2)}</td>
                      <td>{formatNumber(a.images)}</td>
                      <td>{formatNumber(a.tables)}</td>
                      <td>{formatNumber(a.affiliateLinks)}</td>
                      <td>{formatDate(a.published)}</td>
                    </tr>
                  );
                })}
                {Array.from({ length: pending }).map((_, i) => (
                  <tr key={`pending-${i}`}>
                    <td colSpan={7}>
                      <span className="skeleton skeleton-row" />
                    </td>
                  </tr>
                ))}
                {articles.length === 0 && pending === 0 && status.articles === "done" && (
                  <tr>
                    <td colSpan={7} className="muted">
                      No money-style pages detected in the sitemap to sample.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {keyword && sitemap && sitemap.keywordUrls.length > 0 && (
        <div className="kw-pages">
          <h3>
            Pages already targeting “{keyword}” <span className="muted">({sitemap.keywordMatchCount})</span>
          </h3>
          <ul>
            {sitemap.keywordUrls.slice(0, 8).map((u) => (
              <li key={u.url}>
                <a href={u.url} target="_blank" rel="noopener noreferrer">
                  {shortPath(u.url)}
                </a>
                <span className="muted">{u.lastmod ? ` · updated ${formatDate(u.lastmod)}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="manual">
        <span className="chips-label">Check manually</span>
        <a href={`https://ahrefs.com/backlink-checker/?input=${domain}`} target="_blank" rel="noopener noreferrer">
          Backlinks (Ahrefs free)
        </a>
        <a href={`https://www.google.com/search?q=site:${domain}`} target="_blank" rel="noopener noreferrer">
          site: search
        </a>
        <a href={`https://web.archive.org/web/*/${domain}`} target="_blank" rel="noopener noreferrer">
          Wayback history
        </a>
        <a href={`https://www.whois.com/whois/${whois?.registrableDomain ?? domain}`} target="_blank" rel="noopener noreferrer">
          whois.com
        </a>
      </div>

      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
