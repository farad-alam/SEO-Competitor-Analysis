import { formatNumber } from "@/lib/format";
import { averageWords, computeScore, domainAgeYears, formatAge } from "@/lib/score";
import type { DomainState } from "./state";

interface Props {
  results: DomainState[];
  onExport: () => void;
}

export default function ComparisonTable({ results, onExport }: Props) {
  return (
    <div className="panel compare">
      <div className="panel-head">
        <h2>Side-by-side comparison</h2>
        <button type="button" className="btn-ghost" onClick={onExport}>
          Export CSV
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Site</th>
              <th>Score</th>
              <th>Age</th>
              <th>Articles</th>
              <th>Money pages</th>
              <th>Avg words</th>
              <th>Updated 90d</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const sc = computeScore(r);
              return (
                <tr key={r.domain}>
                  <td className="cell-strong">{r.domain}</td>
                  <td>
                    <span className={`score-badge tone-${sc.tone}`}>{sc.score ?? "…"}</span>
                  </td>
                  <td>{formatAge(domainAgeYears(r.whois))}</td>
                  <td>{formatNumber(r.sitemap?.found ? r.sitemap.articleCount : undefined)}</td>
                  <td>{formatNumber(r.sitemap?.found ? r.sitemap.moneyCount : undefined)}</td>
                  <td>{formatNumber(averageWords(r.articles))}</td>
                  <td>{formatNumber(r.sitemap?.found ? r.sitemap.recency.last90 : undefined)}</td>
                  <td>
                    <span className={`tone-text tone-${sc.tone}`}>{sc.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
