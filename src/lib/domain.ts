/** Pure helpers (safe for both client and server). */

const TWO_PART_TLDS = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au",
  "co.nz", "co.in", "net.in", "org.in", "com.br", "com.mx", "co.jp",
  "co.za", "com.sg", "com.my", "com.pk", "com.bd", "org.bd", "com.ng",
  "com.tr", "com.ar", "com.cn", "com.hk", "co.id", "co.kr", "com.ph",
  "com.vn", "com.eg", "com.sa", "co.il",
]);

/** Turns "https://www.Example.com/path?x=1" into "example.com". */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split(/[/?#]/)[0];
  s = s.replace(/^[^@]*@/, "");
  s = s.replace(/:\d+$/, "");
  s = s.replace(/^www\./, "");
  s = s.replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  return s;
}

/** example.co.uk for blog.example.co.uk - used for WHOIS/RDAP lookups. */
export function getRegistrableDomain(host: string): string {
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join(".");
  if (TWO_PART_TLDS.has(last2)) return parts.slice(-3).join(".");
  return last2;
}

/** Splits a free-form textarea into unique, valid domains. */
export function parseDomainList(raw: string, max = 5): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const d = normalizeDomain(part);
    if (d) seen.add(d);
    if (seen.size >= max) break;
  }
  return [...seen];
}
