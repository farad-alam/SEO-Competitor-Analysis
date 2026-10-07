export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatNumber(n?: number): string {
  return n === undefined ? "—" : n.toLocaleString("en-US");
}

export function shortPath(url: string): string {
  try {
    const u = new URL(url);
    const p = decodeURIComponent(u.pathname) + u.search;
    return p.length > 70 ? `${p.slice(0, 67)}…` : p;
  } catch {
    return url;
  }
}

export function csvEscape(v: string | number | undefined): string {
  const s = v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
