---
name: hasdata
description: "Call the `hasdata` tool for live web data (Google SERP, Google Maps, Amazon, Zillow, Redfin, Airbnb, Yelp, Indeed, Bing, Instagram) plus arbitrary URL scraping. Use for: search results, product info, listings, local-business data, jobs, trends, pricing, news, or scraping a URL."
---

# HasData skill

Guides correct use of the `hasdata` tool. The tool's JSON Schema is authoritative; read it first.

## Call shape

- `action` — an endpoint slug (e.g. `google-serp`, `zillow-listing`, `web-scraping`).
- `params` — per-endpoint inputs. The schema is discriminated on `action`.

## Choosing an action

- **Cheap web search** — use `google-serp-light` (5 cr).
- **Full SERP** (AI Overview, PAA, knowledge graph) — use `google-serp` (10 cr).
- **AI-synthesized answer** — use `google-ai-mode`.
- **News** — use `google-news`.
- **Shopping, multi-merchant** — use `google-shopping`.
- **Amazon, known ASIN** — use `amazon-product`.
- **Amazon, keyword search** — use `amazon-search`.
- **Shopify** — use `shopify-products` or `shopify-collections`.
- **Local businesses** — use `google-maps`, then `-place` / `-reviews` / `-photos`.
- **Yelp / YellowPages** — use `yelp-*` or `yellowpages-*`.
- **Real estate (US)** — use `zillow-listing` + `zillow-property`.
- **Redfin** — use `redfin-listing` + `redfin-property`.
- **Short-term rentals** — use `airbnb-listing` (needs `checkIn`, `checkOut`).
- **Jobs** — use `indeed-*`; `glassdoor-*` adds salary signal.
- **Trends** — use `google-trends`.
- **Flights** (15 cr) — use `google-flights`.
- **Any URL, static** — use `web-scraping` with `jsRendering: false`.
- **Any URL, SPA** — use `web-scraping` with `jsRendering: true`, optional `wait`.
- **Structured fields, known layout** — add CSS `extractRules` + `outputFormat: ["json"]`.
- **Structured fields, unknown layout** — add `aiExtractRules`.

## `web-scraping` rules

- `outputFormat` is **always** an array. e.g. `["markdown"]` or `["json", "html"]`. A bare string returns 422.
- `extractRules` — map of field → CSS selector. Append ` @attr` to pull an attribute instead of textContent. Pair with `outputFormat: ["json"]`.
- `aiExtractRules` types: `string`, `number`, `boolean`, `list`, `item`.
- Every `list` and every `item` **must** include `output`.
- List of scalars — shorthand `{ "type": "list", "output": "string" }`.
- List of objects — `{ "type": "list", "output": { field: { type: ... } } }`.
- `item` — single nested record, full object for `output`.
- Full worked example lives in the README.
- Default booleans: `jsRendering: true`, `blockAds: true`, `blockResources: true`, `screenshot: true`, `extractEmails: true`. Turn any off if not needed.

## Filter-name rule (real estate)

- Zillow and Redfin filters use camelCase.
- Write `priceMin`, `priceMax`, `bedsMin`, `homeTypes`, `propertyStatus`.
- Do **not** write the wire form (`price[min]`, `homeTypes[]`).
- Those keys are not in the schema.
- The plugin translates automatically.

## Cost

- Each action, lists its credit cost next to its slug.

## Common errors → fixes

- `422 rule: array, field: outputFormat` — wrap in array: `["markdown"]`.
- `422 rule: jsonSchemaAI ... "output" must be a valid object` — you forgot `output` on a `list` or `item`. Add shorthand `"string"` or full object form.
- Zillow filter silently ignored — you wrote the wire name. Use `priceMin`, not `price[min]`.
- `401` / `403` — API key missing or wrong. Check config or env var.
- Empty SERP / Maps — relax `gl` / `hl` / `location`; they may be too specific.

## Credentials

- The plugin reads the API key from config `plugins.entries.hasdata.config.apiKey`, else from the `HASDATA_API_KEY` env var.
- Never place API keys in `params` — the field is not in the schema.