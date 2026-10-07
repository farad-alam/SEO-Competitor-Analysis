import { NextRequest, NextResponse } from "next/server";
import { analyzeArticle } from "@/lib/article";
import { normalizeDomain } from "@/lib/domain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_URLS_PER_CALL = 6;

export async function POST(req: NextRequest) {
  let body: { domain?: string; urls?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const domain = normalizeDomain(body.domain ?? "");
  if (!domain || !Array.isArray(body.urls)) {
    return NextResponse.json({ error: "domain and urls[] are required" }, { status: 400 });
  }
  const urls = body.urls
    .filter((u): u is string => typeof u === "string")
    .slice(0, MAX_URLS_PER_CALL);
  const results = await Promise.all(urls.map((u) => analyzeArticle(u, domain)));
  return NextResponse.json({ results });
}
