import { NextRequest, NextResponse } from "next/server";
import { normalizeDomain } from "@/lib/domain";
import { analyzeSitemap } from "@/lib/sitemap";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const domain = normalizeDomain(req.nextUrl.searchParams.get("domain") ?? "");
  if (!domain) return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  const keyword = (req.nextUrl.searchParams.get("keyword") ?? "").slice(0, 120).trim() || undefined;
  return NextResponse.json(await analyzeSitemap(domain, keyword));
}
