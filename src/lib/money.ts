import type { MoneyType } from "./types";

const STOP_WORDS = new Set(["a", "an", "the", "for", "of", "to", "in", "on", "and", "or", "with"]);

function stem(t: string): string {
  return t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Detects "money page" intent (best X, X review, A vs B ...) from the URL.
 * Returns the matched type or undefined for ordinary informational posts.
 */
export function classifyMoney(url: string): MoneyType | undefined {
  const tokens = pathOf(url)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const has = (...words: string[]) => words.some((w) => tokens.includes(w));

  if (has("best")) return "best";

  const topIdx = tokens.indexOf("top");
  if (
    topIdx >= 0 &&
    (/^\d+$/.test(tokens[topIdx + 1] ?? "") ||
      ["rated", "picks", "pick"].includes(tokens[topIdx + 1] ?? ""))
  ) {
    return "top";
  }

  if (has("vs", "versus", "compared", "comparison")) return "vs";
  if (has("alternative", "alternatives")) return "alternatives";
  if (has("review", "reviews")) return "review";
  if (has("buying", "buyers", "buyer") && has("guide")) return "guide";
  return undefined;
}

export function keywordTokens(keyword: string): string[] {
  return keyword
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP_WORDS.has(t))
    .map(stem);
}

/** True when every keyword word (singular/plural tolerant) appears in the URL path. */
export function matchesKeyword(url: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const pathTokens = new Set(
    pathOf(url)
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map(stem),
  );
  return tokens.every((t) => pathTokens.has(t));
}

export const MONEY_LABELS: Record<MoneyType, string> = {
  best: "Best …",
  top: "Top N",
  review: "Review",
  vs: "X vs Y",
  guide: "Buying guide",
  alternatives: "Alternatives",
};
