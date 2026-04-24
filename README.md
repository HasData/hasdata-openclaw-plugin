# HasData Plugin for OpenClaw

[![CI](https://github.com/HasData/hasdata-openclaw-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/HasData/hasdata-openclaw-plugin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/HasData/hasdata-openclaw-plugin?sort=semver)](https://github.com/HasData/hasdata-openclaw-plugin/releases)
[![npm](https://img.shields.io/npm/v/@hasdata/hasdata-openclaw-plugin)](https://www.npmjs.com/package/@hasdata/hasdata-openclaw-plugin)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Real-time web data for OpenClaw agents — Google SERP, Google Maps, Google News, Google Shopping, Google Trends, Google Flights, Bing, Amazon, Shopify, Zillow, Redfin, Airbnb, Yelp, YellowPages, Indeed, Glassdoor, Instagram, and arbitrary URL scraping (HTML / Markdown / AI-extracted JSON) — all exposed as a single `hasdata` tool via the [HasData API](https://hasdata.com).

No proxy rotation, no headless-browser farm, no captcha solver to run — one tool call, structured JSON back.

## Install

```sh
openclaw plugins install @hasdata/hasdata-openclaw-plugin
```

Restart the Gateway after installation.

## How it works

1. The agent calls the `hasdata` tool with `action` (one of ~40 endpoint slugs) and `params` (per-endpoint inputs).
2. The plugin forwards the request to `api.hasdata.com`, which renders the page and parses the result.
3. The LLM gets structured JSON back — organic results, prices, reviews, listings, extracted fields — ready to reason over.

The tool schema is **auto-generated** from the live HasData OpenAPI catalog, so every endpoint's required/optional params, enums, and descriptions flow into the LLM's function-call schema. No manual schema drift.

## Get an API key

1. Sign up at [hasdata.com](https://hasdata.com).
2. Copy your API key from the dashboard.
3. Free tier includes 1,000 credits/month — enough to smoke-test every endpoint.

## Configure

Config lives at `~/.openclaw/openclaw.json` under `plugins.entries.hasdata.config`:

```jsonc
{
  "plugins": {
    "entries": {
      "hasdata": {
        "enabled": true,
        "config": {
          "apiKey": "hd_xxx",
          "baseUrl": "https://api.hasdata.com", // optional
          "timeoutMs": 120000                   // optional (default 120s)
        }
      }
    }
  }
}
```

Or use the CLI wizard:

```sh
openclaw hasdata setup --api-key hd_xxx
```

`apiKey` also falls back to the `HASDATA_API_KEY` environment variable.

## `hasdata` tool

Single tool, two fields:

- **`action`** (enum) — endpoint slug, e.g. `google-serp`, `amazon-product`, `zillow-listing`, `web-scraping`.
- **`params`** (object) — endpoint-specific parameters. Schema enforced per action.

### Supported sources

**Search engines**

- **Google Search** — `google-serp`, `google-serp-light`, `google-ai-mode`, `google-news`, `google-shopping`, `google-images`, `google-short-videos`, `google-events`, `google-flights`, `google-trends`, `google-immersive-product`.
- **Bing** — `bing-serp`.

**Google Maps & local**

- **Google Maps** — `google-maps` (business search), `google-maps-place`, `google-maps-reviews`, `google-maps-contributor-reviews`, `google-maps-photos`.
- **Yelp** — `yelp-search`, `yelp-place`.
- **YellowPages** — `yellowpages-search`, `yellowpages-place`.

**E-commerce**

- **Amazon** — `amazon-search`, `amazon-product`, `amazon-seller`, `amazon-seller-products`.
- **Shopify** — `shopify-products`, `shopify-collections`.

**Real estate & travel**

- **Zillow** — `zillow-listing`, `zillow-property`.
- **Redfin** — `redfin-listing`, `redfin-property`.
- **Airbnb** — `airbnb-listing`, `airbnb-property`.

**Jobs**

- **Indeed** — `indeed-listing`, `indeed-job`.
- **Glassdoor** — `glassdoor-listing`, `glassdoor-job`.

**Social**

- **Instagram** — `instagram-profile`.

**Arbitrary web**

- **`web-scraping`** — scrape any URL with JS rendering, residential proxies, ad blocking, markdown output, CSS-selector extraction, AI-based extraction rules, screenshots.

Full endpoint list with per-action parameter schemas is embedded in the tool description the LLM sees; reference docs at [docs.hasdata.com](https://docs.hasdata.com).

### Examples

```js
// Google SERP — grounding an LLM answer in live search results
await hasdata({
  action: "google-serp",
  params: { q: "best espresso machine 2026", gl: "us", num: 20 }
});

// Amazon product lookup — price monitoring
await hasdata({
  action: "amazon-product",
  params: { asin: "B08N5WRWNW", domain: "amazon.com" }
});

// Zillow listings — real-estate research
await hasdata({
  action: "zillow-listing",
  params: {
    keyword: "Austin, TX",
    type: "forSale",
    priceMin: 400000,
    priceMax: 900000,
    bedsMin: 3,
    homeTypes: ["house", "townhome"],
    sort: "priceLowToHigh"
  }
});

// Google Maps — local lead generation
await hasdata({
  action: "google-maps",
  params: { q: "plumber", ll: "@30.267,-97.743,14z", hl: "en" }
});

// Indeed — job-market intelligence
await hasdata({
  action: "indeed-listing",
  params: { keyword: "rust engineer", location: "Remote", fromDays: 7 }
});

// Scrape any URL to markdown — RAG ingestion
await hasdata({
  action: "web-scraping",
  params: {
    url: "https://news.ycombinator.com",
    outputFormat: ["markdown"],
    jsRendering: true
  }
});

// Scrape with AI extraction — structured data from unstructured pages
await hasdata({
  action: "web-scraping",
  params: {
    url: "https://example.com/annual-report",
    aiExtractRules: {
      ceo_name:     { type: "string", description: "Name of the CEO" },
      revenue_usd:  { type: "number", description: "Revenue in USD" },
      year_founded: { type: "number" },
      // `list` of scalars — shorthand `output: "string"`
      board_members: { type: "list", output: "string" },
      // `item` — nested object, always needs `output: { ... }`
      hq_address: {
        type: "item",
        output: {
          city:    { type: "string" },
          country: { type: "string" }
        }
      }
    }
  }
});
```

## Use cases

### AI agents & tool-use

Drop `hasdata` into any OpenClaw agent and it can search the web, check prices, look up properties, fetch reviews, and scrape arbitrary pages without leaving the agent loop. Because the tool schema is strict and auto-generated, the LLM rarely hallucinates parameters — and when it does, the response surfaces the API's validation error verbatim.

### RAG ingestion

Stream fresh Google SERP, News, Shopping, or arbitrary web pages into your vector store. A sub-agent loop running `google-serp` → `web-scraping` with `outputFormat: ["markdown"]` produces clean Markdown chunks ready to embed.

### Prompt-time grounding

Need up-to-date facts mid-conversation? Have the agent call `google-serp` or `google-ai-mode` and paste the structured response into its reasoning context. Works around the LLM's training cutoff for current events, product pricing, real-estate comps, and fresh reviews.

### Price monitoring & competitive intelligence

Poll `amazon-product`, `amazon-search`, `google-shopping`, and `shopify-products` on a schedule to track competitor pricing, stock status, and new-product launches.

### Real-estate research

`zillow-listing` + `zillow-property`, `redfin-listing` + `redfin-property`, and `airbnb-listing` + `airbnb-property` cover sale, rent, and short-term-rental comps across the US market.

### Local-business lead generation

`google-maps` + `yelp-search` + `yellowpages-search` produce name, address, phone, website, hours, rating, and review counts for any city × niche combination — ready for CRM import or outreach.

### Job-market intelligence

`indeed-listing` + `glassdoor-listing` track open roles by keyword, location, and recency; pair with `indeed-job` / `glassdoor-job` for full JD text.

### SEO & SERP tracking

`google-serp`, `google-serp-light`, and `google-ai-mode` return organic positions, AI Overviews, ads, PAA ("People Also Ask"), knowledge panels, and related searches — the data set SEO teams rebuild from scratch in every tool.

### News & sentiment monitoring

`google-news` plus `web-scraping` with `outputFormat: ["markdown"]` produces a clean feed of recent articles on any topic, publisher, or geography.

### Travel research

`google-flights`, `airbnb-listing`, and `google-maps-reviews` cover the travel research triangle — flight search, lodging, and on-the-ground reviews — in three tool calls.

### Any page, any shape

When no dedicated endpoint exists, `web-scraping` renders JS, rotates proxies, bypasses anti-bot, and returns HTML, text, Markdown, or AI-extracted structured JSON — with `aiExtractRules` letting the agent declare the output shape inline.

## CLI

The plugin registers an `openclaw hasdata` subcommand:

```sh
openclaw hasdata setup --api-key hd_xxx      # write API key to ~/.openclaw/openclaw.json
openclaw hasdata status                      # print the currently-loaded plugin config (API key masked)
openclaw hasdata test --query "openclaw"     # cheap smoke test against google-serp-light
```

## Tips for agents

- **Pick the cheap endpoint first.** `google-serp-light` (5cr) is enough for most "what does Google say about X" queries; reserve `google-serp` (10cr) for when you need AI Overview, knowledge graph, or PAA.
- **Use Markdown output for LLM context.** `web-scraping` + `outputFormat: ["markdown"]` produces a clean representation that's cheap to feed back into the model.
- **Use `aiExtractRules` instead of parsing HTML in the agent.** HasData runs the extraction server-side; you get structured JSON back and save LLM tokens.
- **Check `credits` in the response** to track spend per call; HasData returns it on every successful response.

## Security

- API keys are read from `plugins.entries.hasdata.config.apiKey` (plaintext in the config file — Lock down `~/.openclaw/openclaw.json` as you would `~/.aws/credentials`) or from the `HASDATA_API_KEY` environment variable. They never ship in the tool payload.
- The plugin only reaches `https://api.hasdata.com` (override via `baseUrl`). It does not make any other outbound connections.
- Tool responses are plain JSON from the HasData API. When you pass scraped content back into a prompt, treat it as untrusted — same defensive posture you'd use for anything off the open web.

## Development

```sh
git clone https://github.com/HasData/hasdata-openclaw-plugin.git
cd hasdata-openclaw-plugin
npm install
npm run typecheck
npm test
```

Local dev against a live OpenClaw install:

```sh
openclaw plugins install --link /path/to/hasdata-openclaw-plugin
```

### Local testing (no OpenClaw required)

The plugin ships with `scripts/try.ts` — a thin runner that invokes the `hasdata` tool directly so you can verify any action end-to-end without installing OpenClaw.

```sh
# List every action the plugin exposes
npm run try -- list

# ---------- web-scraping: CSS-selector extractRules ----------
# Pull specific fields out of Hacker News with CSS selectors. The `@attr`
# suffix (e.g. `@href`) extracts an attribute; without it you get textContent.
# Use outputFormat:["json"] so the response returns the extracted object.
npm run try -- web-scraping '{
  "url": "https://news.ycombinator.com",
  "extractRules": {
    "story_title": "tr.athing .titleline > a",
    "story_link":  "tr.athing .titleline > a @href",
    "score":       ".score"
  },
  "outputFormat": ["json"]
}'

# ---------- web-scraping: AI extractRules ----------
# Declare the output shape and let HasData's LLM extractor fill it.
# Types: string | number | boolean | list | item.
# Every `list` and `item` needs an `output` — use the shorthand "string"
# for a scalar list, or a full object for a list of structured records.
# Docs: https://docs.hasdata.com/apis/web-scraping-api/llm-extraction
npm run try -- web-scraping '{
  "url": "https://hasdata.com/prices",
  "aiExtractRules": {
    "company":     { "type": "string", "description": "company name" },
    "yearFounded": { "type": "number" },
    "plans": {
      "type": "list",
      "description": "pricing tiers offered on the page",
      "output": {
        "name":              { "type": "string" },
        "price_monthly_usd": { "type": "number" },
        "features":          { "type": "list", "output": "string" }
      }
    },
    "trial": {
      "type": "item",
      "output": {
        "available": { "type": "boolean" },
        "kind":      { "type": "string", "enum": ["paid", "free"] }
      }
    }
  }
}'

# ---------- web-scraping: custom headers, JS rendering, waits ----------
# Send custom HTTP headers, render JS, wait for a selector before scraping.
npm run try -- web-scraping '{
  "url": "https://httpbin.org/headers",
  "headers": {
    "User-Agent":      "HasData-Agent/1.0",
    "Accept-Language": "en-US",
    "X-Custom-Header": "test-value"
  },
  "jsRendering":  true,
  "waitFor":      "body",
  "wait":         2000,
  "outputFormat": ["json", "html"]
}'

# ---------- web-scraping: boolean flags combo ----------
# Cheapest-possible static fetch: JS off, ads and resources blocked, no
# screenshot, no email extraction, links extracted, base64 images stripped.
npm run try -- web-scraping '{
  "url":                 "https://news.ycombinator.com",
  "jsRendering":         false,
  "blockAds":            true,
  "blockResources":      true,
  "screenshot":          false,
  "extractEmails":       false,
  "extractLinks":        true,
  "removeBase64Images":  true,
  "outputFormat":        ["markdown"]
}'

# Dry-run — just print the URL that would be called (no API key needed)
npm run try -- --dry-run google-serp '{"q":"coffee","num":5,"gl":"us"}'
# → GET https://api.hasdata.com/scrape/google/serp?q=coffee&num=5&gl=us

npm run try -- --dry-run zillow-listing '{"keyword":"Austin, TX","type":"forSale","homeTypes":["house","townhome"]}'
# → GET https://api.hasdata.com/scrape/zillow/listing?keyword=Austin%2C+TX&type=forSale&homeTypes%5B%5D=house&homeTypes%5B%5D=townhome

npm run try -- --dry-run web-scraping '{"url":"https://news.ycombinator.com","outputFormat":["markdown"]}'
# → POST https://api.hasdata.com/scrape/web
#   body: {"url":"https://news.ycombinator.com","outputFormat":["markdown"]}

# Live call — requires a real API key
export HASDATA_API_KEY=hd_xxx
npm run try -- google-serp '{"q":"openclaw"}'         # pretty-print, truncated
npm run try -- --raw google-serp '{"q":"openclaw"}'   # full JSON to stdout (pipe to jq)

# Verbose: see the outgoing URL + request headers + response timing
npm run try -- --debug amazon-product '{"asin":"B08N5WRWNW"}'
```

The runner goes through `createHasDataTool` + `HasDataClient.execute`, exercising the same code path the OpenClaw runtime uses — so if it works here, it'll work in the Gateway.

### Regenerating the endpoint schema

`src/endpoints.generated.ts` is auto-generated from `https://api.hasdata.com/apis`. To refresh locally:

```sh
npm run generate
```

A scheduled GitHub Action runs this daily and opens a PR when the schema drifts, so the plugin tracks the HasData catalog within 24 hours of any API change.

## Support

- Docs — <https://docs.hasdata.com>
- API catalog — <https://hasdata.com/apis>
- Issues — <https://github.com/HasData/hasdata-openclaw-plugin/issues>
- HasData support — <support@hasdata.com>

## License

[MIT](LICENSE).
