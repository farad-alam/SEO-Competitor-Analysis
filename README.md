# RankScout - Free SEO Competitor Analyzer

Paste competitor domains (and optionally your target keyword) and get, in seconds:

- **Domain age** - registration/expiry/registrar via free RDAP + first Wayback capture
- **Content volume** - total URLs and articles from the sitemap
- **Money pages** - `best-*`, `top-N`, `*-review`, `A-vs-B`, buying guides, alternatives
- **Word count & structure** of sampled money pages (H2s, images, tables, affiliate links, schema)
- **Freshness** - pages updated in the last 30/90/365 days
- **Site signals** - CMS, ad network (Mediavine/Raptive = big traffic), trust pages
- **Competition score** (0-100) with plain-English reasons, plus CSV export

No API keys, no paid services. Backlinks are *not* included (they need paid data) -
quick links to free manual checks are provided per site.

## Run locally

```bash
npm install
npm run dev
```

## Deploy free on Vercel

1. Push this folder to a GitHub repo.
2. Go to <https://vercel.com/new>, import the repo, and click **Deploy**. No env vars needed.

API routes set `maxDuration` (30-60s) which is allowed on the Hobby plan.

## How it works

| Route | What it does |
|---|---|
| `GET /api/whois?domain=` | RDAP lookup + Wayback first-seen date |
| `GET /api/site?domain=` | Homepage: CMS, ads, trust pages, menu topics |
| `GET /api/sitemap?domain=&keyword=` | Discovers & parses sitemaps, classifies money pages |
| `POST /api/articles` | Fetches up to 6 pages and measures words/headings/images |

The UI calls them in parallel and fills in each card progressively.

## Limitations

- Sites behind strong bot protection (e.g. Cloudflare challenges) may block datacenter IPs.
- Very large sitemaps (80+ files) are capped for speed; counts are flagged as partial.
- Money pages are detected from URL patterns, so unconventional slugs can be missed.
- JS-rendered pages can show very low word counts.
