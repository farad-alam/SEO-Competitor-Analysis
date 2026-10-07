import { getRegistrableDomain } from "./domain";
import { fetchRaw } from "./http";
import type { WhoisResult } from "./types";

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}
interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, [string, unknown, string, unknown][]];
  entities?: RdapEntity[];
}
interface RdapDoc {
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: { ldhName?: string }[];
  status?: string[];
}

function findRegistrar(entities: RdapEntity[] | undefined): string | undefined {
  for (const e of entities ?? []) {
    if (e.roles?.includes("registrar")) {
      const fn = e.vcardArray?.[1]?.find((v) => v[0] === "fn");
      if (fn && typeof fn[3] === "string") return fn[3];
    }
    const nested = findRegistrar(e.entities);
    if (nested) return nested;
  }
  return undefined;
}

async function firstArchived(registrable: string): Promise<string | undefined> {
  const r = await fetchRaw(
    `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(registrable)}&limit=1&fl=timestamp&output=json`,
    { timeoutMs: 7000, maxBytes: 64 * 1024, accept: "application/json" },
  );
  if (!r.ok) return undefined;
  try {
    const rows = JSON.parse(r.text()) as string[][];
    const ts = rows?.[1]?.[0];
    if (ts && /^\d{8}/.test(ts)) {
      return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Free WHOIS replacement: RDAP (via rdap.org bootstrap) + Wayback first capture. */
export async function lookupWhois(domain: string): Promise<WhoisResult> {
  const registrable = getRegistrableDomain(domain);
  const [rdap, archived] = await Promise.all([
    fetchRaw(`https://rdap.org/domain/${encodeURIComponent(registrable)}`, {
      timeoutMs: 9000,
      maxBytes: 512 * 1024,
      accept: "application/rdap+json,application/json",
    }),
    firstArchived(registrable),
  ]);

  const base: WhoisResult = {
    domain,
    registrableDomain: registrable,
    nameservers: [],
    status: [],
    firstArchived: archived,
    rdapAvailable: false,
  };

  if (!rdap.ok) {
    return {
      ...base,
      note:
        rdap.status === 404
          ? "RDAP has no record for this TLD. Check whois.com manually; Wayback date is shown as a fallback."
          : `RDAP lookup failed (${rdap.error ?? `HTTP ${rdap.status}`}).`,
    };
  }

  try {
    const doc = JSON.parse(rdap.text()) as RdapDoc;
    const ev = (action: string) =>
      doc.events?.find((e) => e.eventAction?.toLowerCase() === action)?.eventDate;
    return {
      ...base,
      rdapAvailable: true,
      registered: ev("registration"),
      expires: ev("expiration"),
      updated: ev("last changed"),
      registrar: findRegistrar(doc.entities),
      nameservers: (doc.nameservers ?? []).map((n) => n.ldhName ?? "").filter(Boolean),
      status: doc.status ?? [],
    };
  } catch {
    return { ...base, note: "RDAP response could not be parsed." };
  }
}
