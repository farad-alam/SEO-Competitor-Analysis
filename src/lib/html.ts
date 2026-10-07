import type { CheerioAPI } from "cheerio";

export const AFFILIATE_RE =
  /(amazon\.[a-z.]+\/[^"'\s]*[?&]tag=|amzn\.to|amzn\.com|shareasale\.com|linksynergy|awin1\.com|impact\.com|partnerize|skimresources|geni\.us|clickbank|jdoqocy|tkqlhce|anrdoezrs|dpbolvw|\/go\/|\/recommends\/|\/out\/|\/goto\/)/i;

interface SchemaInfo {
  types: string[];
  published?: string;
  modified?: string;
}

function walk(node: unknown, types: Set<string>, dates: { published?: string; modified?: string }): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, types, dates));
    return;
  }
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (typeof t === "string") types.add(t);
  else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
  if (typeof obj.datePublished === "string" && !dates.published) dates.published = obj.datePublished;
  if (typeof obj.dateModified === "string" && !dates.modified) dates.modified = obj.dateModified;
  if (obj["@graph"]) walk(obj["@graph"], types, dates);
}

/** Extracts JSON-LD @type values and published/modified dates. */
export function extractSchema($: CheerioAPI): SchemaInfo {
  const types = new Set<string>();
  const dates: { published?: string; modified?: string } = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      walk(JSON.parse(raw), types, dates);
    } catch {
      /* ignore invalid JSON-LD */
    }
  });
  return { types: [...types], ...dates };
}

export function countWords(text: string): number {
  const t = text.replace(/\s+/g, " ").trim();
  return t ? t.split(" ").length : 0;
}
