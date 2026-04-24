---
name: hasdata
description: Use the hasdata tool to fetch real-time web data — Google SERP, Google Maps, Amazon, Zillow, Redfin, Airbnb, Yelp, Indeed, Bing, Instagram, and arbitrary URL scraping (HTML, Markdown, or AI-extracted JSON) via the HasData API. Trigger this skill when the user asks about search results, product information, real-estate or short-term-rental listings, local-business data, job postings, market trends, competitive pricing, news, or scraping a web page.
---

# HasData skill

This skill tells the agent how to call the `hasdata` tool correctly. The tool itself validates every field against a strict JSON Schema; this guide covers cross-field rules, cost-aware routing, and common mistakes that do not fit into field-level descriptions.

## Call shape

Every call picks an `action` (an endpoint slug such as `google-serp` or `zillow-listing`) and a `params` object whose schema is specific to that action. The discriminated-union schema the tool advertises is authoritative for per-action field types, enums, and defaults; read it first when in doubt.

## Picking the right action

**Web search.** Prefer `google-serp-light` (5 credits) for a basic "what does Google say about X" lookup. Reach for `google-serp` (10 credits) only when you need AI Overview, People Also Ask, Knowledge Graph, or ads. `google-ai-mode` returns synthesized answer. `google-news` searches the news index.

**Shopping and products.** Use `google-shopping` for multi-merchant discovery, then drill into a specific retailer. For Amazon, prefer `amazon-product` with an ASIN when you already know the product; use `amazon-search` to discover ASINs by keyword. Shopify stores are covered by `shopify-products` and `shopify-collections`.

**Local businesses.** `google-maps` returns name, phone, address, website, rating, and review counts for a keyword search. Follow up with `google-maps-place`, `google-maps-reviews`, or `google-maps-photos` for a specific place. `yelp-search` / `yelp-place` and `yellowpages-search` / `yellowpages-place` cover the corresponding directories.

**Real estate and travel.** `zillow-listing` plus `zillow-property` cover US sale, rent, and sold comps; `redfin-listing` + `redfin-property` is an alternate source. For short-term rentals use `airbnb-listing` (needs `checkIn` and `checkOut`) then `airbnb-property` for full details. Flight search is `google-flights` (15 credits — batch where possible).

**Jobs.** `indeed-listing` + `indeed-job` for broad coverage; `glassdoor-*` adds salary signal.

**Anything else.** `web-scraping` fetches any URL. Set `jsRendering: false` when the page is static (cheaper, faster). Use CSS `extractRules` when the page layout is stable; use `aiExtractRules` when it is not.

## `web-scraping` rules

`outputFormat` is always an **array of strings** (`["markdown"]`, `["json", "html"]`, and so on). Passing a bare string returns HTTP 422.

CSS `extractRules` takes a map of output-field-name to CSS selector. Append a space plus `@attr` to the selector to pull an attribute value rather than text content. Pair with `outputFormat: ["json"]` so the response carries the extracted object.

`aiExtractRules` lets the server-side LLM extract declared fields. Supported types are `string`, `number`, `boolean`, `list`, and `item`. Two rules trip up most agents:

1. Every `list` and every `item` **must** include an `output`. For a list of scalars use the shorthand string form — `{ "type": "list", "output": "string" }`. For a list of objects, or for an `item`, use a full object — `{ "type": "list", "output": { "field": { "type": "..." } } }`.
2. `item` is for a single nested record; `list` is for an array. To get a list of objects, use `list` with an object-shaped `output`.

See the README for a full worked `aiExtractRules` example. Default booleans for `web-scraping` are `jsRendering: true`, `blockAds: true`, `blockResources: true`, `screenshot: true`, and `extractEmails: true`. Turn any of these off if you don't need them.

## Filter name convention

Real-estate endpoints (Zillow, Redfin) expose ergonomic camelCase names — `priceMin`, `priceMax`, `bedsMin`, `homeTypes`, `propertyStatus`, and so on. The plugin translates these to HasData's wire format internally. Do not pass the wire form (`price[min]`, `homeTypes[]`) — those keys are not in the schema and are silently ignored.

## Common errors and fixes

If you get a 422 complaining about `outputFormat`, wrap the value in an array. If a 422 mentions `aiExtractRules` and "output field must be a valid object", you omitted `output` on a `list` or `item` somewhere. If a Zillow filter appears to be ignored, you probably wrote the wire name; use the schema name instead. A 401 or 403 means the API key is missing or wrong — check the `HASDATA_API_KEY` environment variable or `plugins.entries.hasdata.config.apiKey` in the OpenClaw config. Empty SERP or Maps results usually mean the `gl` / `hl` / `location` combination is too specific; relax one and retry.

## Credentials

The plugin injects the API key automatically from the `plugins.entries.hasdata.config.apiKey` setting or the `HASDATA_API_KEY` environment variable, in that order. Never put API keys in `params` — the field does not exist in the schema and would leak into logs at best.