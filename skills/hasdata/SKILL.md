---
name: hasdata
description: Use the `hasdata` tool to fetch real-time web data — Google SERP, Google Maps, Amazon, Zillow, Redfin, Airbnb, Yelp, Indeed, Bing, Instagram, and arbitrary URL scraping (HTML / markdown / AI-extracted JSON) via the HasData API. Use when the user asks for search results, product info, real-estate or short-term-rental listings, local-business data, job postings, trends, competitive pricing, news, or scraping any web page.
---

# HasData skill

This skill teaches the agent how to call the `hasdata` tool correctly. The tool itself has a strict JSON Schema for every action — this guide covers the cross-field rules, cost-aware routing, and common mistakes that don't fit cleanly into field-level descriptions.

## Shape of a call

```jsonc
{
  "action": "<endpoint-slug>",   // e.g. "google-serp", "zillow-listing", "web-scraping"
  "params": { /* per-endpoint fields */ }
}
```

Every action carries its own validated params schema. When in doubt, read the schema — the field types, enums, and defaults are authoritative.

## Picking the right action

| User intent | Action(s) | Notes |
|---|---|---|
| Cheap web search | `google-serp-light` (5cr) | Just organic results. First choice for "what does Google say about X". |
| Full SERP (AI Overview, PAA, knowledge graph, ads) | `google-serp` (10cr) | Use when the user wants anything beyond organic results. |
| AI-synthesized answer | `google-ai-mode` (5cr) | Gemini-style conversational SERP. |
| News | `google-news` (10cr) | Supports `publishers`, `when` filters. |
| Shopping discovery | `google-shopping` (10cr) | Multi-merchant. For a single retailer use `amazon-*` / `shopify-*`. |
| Amazon product by ASIN | `amazon-product` (5cr) | Prefer over `amazon-search` when ASIN is known. |
| Amazon keyword search | `amazon-search` (5cr) | Returns ASINs + prices; follow up with `amazon-product` for detail. |
| Local business search | `google-maps` (5cr) | Returns name/phone/site/rating. Pair with `google-maps-place`/`-reviews` for deep dives. |
| Real-estate comps (sale/rent/sold) | `zillow-listing` (5cr) + `zillow-property` | `redfin-*` for alt sources. |
| Short-term rentals | `airbnb-listing` + `airbnb-property` | Needs `checkIn` / `checkOut`. |
| Jobs | `indeed-listing` + `indeed-job` | `glassdoor-*` for salary signal. |
| Trends | `google-trends` (5cr) | Popularity over time / geo. |
| Flights | `google-flights` (15cr) | Expensive — batch where possible. |
| Any URL (static) | `web-scraping` with `jsRendering: false` | Cheaper and faster. |
| Any URL (needs JS) | `web-scraping` with `jsRendering: true`, optional `waitFor` | SPA / client-rendered pages. |
| Structured fields from known layout | `web-scraping` + `extractRules` (CSS) + `outputFormat: ["json"]` | Deterministic, no LLM cost on HasData side. |
| Structured fields from unstructured pages | `web-scraping` + `aiExtractRules` | HasData runs the extractor server-side. |

## `web-scraping` parameter rules

### `outputFormat` is always an array

```js
// ✅ correct
{ "outputFormat": ["markdown"] }
{ "outputFormat": ["json", "html"] }   // returns both under keyed fields

// ❌ HTTP 422
{ "outputFormat": "markdown" }
```

When only one of `html` / `text` / `markdown` is requested, the response body is the content directly. With multiple formats, the body is a JSON object with per-format keys. `json` is the key under which `extractRules` / `aiExtractRules` results land.

### `extractRules` — CSS selectors

```js
{
  "url": "https://news.ycombinator.com",
  "extractRules": {
    "story_title": "tr.athing .titleline > a",   // textContent
    "story_link":  "tr.athing .titleline > a @href",  // @attr extracts an attribute
    "score":       ".score"
  },
  "outputFormat": ["json"]
}
```

Use `extractRules` when the page has a stable layout and you can write a selector. No per-extraction cost beyond the normal page fetch.

### `aiExtractRules` — LLM extraction

Every `list` and `item` **must** include an `output`. For a list of scalars use the string shorthand; for a list of objects or an `item`, use a full object.

```js
{
  "url": "https://example.com/pricing",
  "aiExtractRules": {
    // scalars at the top
    "company":      { "type": "string", "description": "company name" },
    "year_founded": { "type": "number" },

    // list of scalars — shorthand
    "board_members": { "type": "list", "output": "string" },

    // nested object
    "hq_address": {
      "type": "item",
      "output": {
        "city":    { "type": "string" },
        "country": { "type": "string" }
      }
    },

    // list of objects
    "plans": {
      "type": "list",
      "description": "pricing tiers on the page",
      "output": {
        "name":               { "type": "string" },
        "price_monthly_usd":  { "type": "number" },
        "features":           { "type": "list", "output": "string" }
      }
    },

    // enums work on strings
    "trial_type": { "type": "string", "enum": ["paid", "free", "none"] }
  }
}
```

**Supported types:** `string`, `number`, `boolean`, `list`, `item`. Unmatched fields return `null` — no explicit required/optional flag.

### Headers, waits, rendering

```js
{
  "url": "https://app.example.com/dashboard",
  "headers": { "Accept-Language": "en-US", "X-Auth-Token": "..." },
  "jsRendering": true,
  "waitFor":     "[data-ready]",   // CSS selector to wait for
  "wait":        2000,             // ms after load, belt-and-suspenders
  "outputFormat": ["markdown"]
}
```

Default booleans: `blockAds: true`, `blockResources: true`, `screenshot: true` (yes — true by default), `jsRendering: true`, `extractEmails: true`. Turn off any you don't need to save bandwidth.

### When to pick which extraction mode

- **Known layout, repeat crawl** → `extractRules` (CSS). Cheapest, deterministic.
- **Known layout, occasional page** → `extractRules` or just `outputFormat: ["markdown"]` + parse in the agent.
- **Unknown layout / schema drift** → `aiExtractRules`. HasData runs the LLM server-side.
- **Agent will read prose** → `outputFormat: ["markdown"]`. Markdown is cheap token-wise.

## Filters on structured endpoints

Zillow/Redfin use ergonomic camelCase in this plugin — `priceMin`, `priceMax`, `bedsMin`, `homeTypes`, `propertyStatus` etc. The plugin translates to HasData's wire format (`price[min]`, `homeTypes[]`) internally. **Do not** write `price[min]` or `homeTypes[]` in the schema — those literal keys aren't in the schema and won't be recognized.

## Batching & cost

- Prefer one call with larger `num` (SERP) / `limit` (Shopify) over N small calls.
- For lookups by ID (`amazon-product`, `zillow-property`, `yelp-place`), call per-ID only for ones you actually need — don't loop eagerly.
- Check `credits` in the response to track spend; HasData returns it on every successful call.
- If a page is static, pass `jsRendering: false` on `web-scraping` — JS rendering is slower without a price discount.

## Common errors

| Error | Fix |
|---|---|
| `422 rule: array, field: outputFormat` | `outputFormat` must be an array: `["markdown"]` not `"markdown"`. |
| `422 rule: jsonSchemaAI, field: aiExtractRules ... "output" field must be a valid object` | You passed `type: "list"` or `type: "item"` without `output`. Add `output: "string"` (scalar list) or `output: { ... }` (object list / item). |
| Filter silently ignored on Zillow | You wrote the wire name (`price[min]`). Use the schema name (`priceMin`). |
| `401`/`403` | API key missing or wrong — check `HASDATA_API_KEY` / `plugins.entries.hasdata.config.apiKey`. |
| Empty results | For SERP/Maps, try relaxing `gl`/`hl`/`location`. For Zillow, confirm the `keyword` resolves to a real region on Zillow's UI. |

## Authentication

The plugin injects the API key automatically. **Never** put API keys into `params` — any `apiKey` field passed by the LLM is ignored at best, leaked at worst.