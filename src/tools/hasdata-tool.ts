import { Type } from "@sinclair/typebox";
import { HasDataClient, HasDataError } from "../client.js";
import {
  ENDPOINTS,
  ENDPOINT_SLUGS,
  type EndpointSlug,
} from "../endpoints.generated.js";

export interface HasDataToolConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  debug?: boolean;
}

function buildToolDescription(): string {
  const categories = new Map<string, string[]>();
  for (const slug of ENDPOINT_SLUGS) {
    const ep = ENDPOINTS[slug];
    const key = ep.category || "Other";
    const req =
      ep.required.length > 0
        ? `  (required: ${ep.required.join(", ")})`
        : "";
    const line = `  - ${slug} (${ep.cost}cr) — ${ep.title}${req}`;
    const arr = categories.get(key);
    if (arr) arr.push(line);
    else categories.set(key, [line]);
  }

  const lines: string[] = [
    "Fetch real-time web data via the HasData API — Google SERP, Google Maps, Google News, Google Shopping, Google Trends, Google Flights, Bing, Amazon, Shopify, Zillow, Redfin, Airbnb, Yelp, YellowPages, Indeed, Glassdoor, Instagram, and arbitrary URL scraping (HTML / Markdown / AI-extracted JSON). Returns structured JSON.",
    "",
    "Call shape: `{ action: <slug>, params: <object> }`.",
    "- `action` — pick one slug from the catalog below.",
    "- `params` — a free-form object whose allowed fields depend on the chosen action. Required fields for each action are listed in parentheses. Unknown fields are rejected server-side with HTTP 422.",
    "",
    "Endpoint catalog:",
  ];
  for (const [cat, items] of categories) {
    lines.push(`* ${cat}`);
    lines.push(...items);
  }

  lines.push(
    "",
    "Per-action parameter hints (common optional fields):",
    "- `google-serp` / `google-serp-light` / `google-news` / `google-shopping` / `google-images` / `google-events` / `google-short-videos`: `q` (required), `gl`, `hl`, `num`, `location`, `domain`, `deviceType`.",
    "- `google-ai-mode`: `q` (required), `gl`, `hl`, `location`.",
    "- `google-flights`: `departureId`, `arrivalId`, `outboundDate` (all required); `returnDate`, `currency`.",
    "- `google-trends`: `q` (required); `geo`, `timeRange`, `dataType`.",
    "- `google-maps`: `q` (required); `ll` (e.g. `@30.267,-97.743,14z`), `hl`.",
    "- `google-maps-place`: `placeId` (required).",
    "- `google-maps-reviews`: `dataId` OR `placeId` (one required); `hl`, `sortBy`, `topic`.",
    "- `bing-serp`: `q` (required); `mkt`, `cc`, `count`.",
    "- `amazon-product`: `asin` (required); `domain`, `language`.",
    "- `amazon-search`: `q` (required); `domain`, `language`, `page`.",
    "- `amazon-seller` / `amazon-seller-products`: `sellerId` (required); `domain`, `language`, `page`.",
    "- `shopify-products` / `shopify-collections`: `url` (required); `limit`, `collection`.",
    "- `zillow-listing`: `keyword` and `type` (`forSale`|`forRent`|`sold`) required; `priceMin`, `priceMax`, `bedsMin`, `bedsMax`, `homeTypes`, `propertyStatus`, `sort`. Use camelCase — the plugin translates to HasData's wire format (`price[min]`, `homeTypes[]`).",
    "- `zillow-property` / `redfin-property` / `airbnb-property` / `indeed-job` / `glassdoor-job` / `yellowpages-place`: `url` (required).",
    "- `redfin-listing`: `location` (required); `status`, `priceMin`, `priceMax`, `bedsMin`.",
    "- `airbnb-listing`: `location` and `checkIn` required; `checkOut`, `adults`, `children`, `infants`, `pets`, `currency`, `nextPageToken`.",
    "- `yelp-search` / `yellowpages-search`: `keyword` and `location` required.",
    "- `yelp-place`: `yelpId` OR `yelpAlias` (one required).",
    "- `indeed-listing` / `glassdoor-listing`: `keyword` (required for both) and `location` (required for Glassdoor, optional for Indeed); `fromDays`, `radius`.",
    "- `instagram-profile`: `username` (required).",
    "- `web-scraping` (POST): `url` (required); `outputFormat` (array — see below), `jsRendering`, `headers`, `extractRules` (CSS map), `aiExtractRules` (LLM extraction), `screenshot`, `blockAds`, `blockResources`, `extractEmails`, `extractLinks`, `includeOnlyTags`, `excludeTags`, `waitFor`, `wait`, `proxyType`, `proxyCountry`, `jsScenario`.",
    "",
    "Picking the right endpoint:",
    "- Web search → `google-serp-light` (5cr) is enough for most 'what does Google say' queries. Reserve `google-serp` (10cr) for when you need AI Overview, knowledge graph, or People-Also-Ask.",
    "- News → `google-news`. AI-synthesized answer → `google-ai-mode`. Shopping/price discovery → `google-shopping` (broad) or `amazon-search` / `amazon-product` (retailer-specific).",
    "- Local businesses → `google-maps` for search, `google-maps-place`/`-reviews`/`-photos` for a known place. `yelp-*` / `yellowpages-*` for directory-style data.",
    "- Real estate → `zillow-listing` + `zillow-property` (sale/rent/sold, US). `redfin-*` for alt comps. `airbnb-*` for short-term rentals.",
    "- Jobs → `indeed-listing` + `indeed-job` (broad), `glassdoor-*` (with salary signal).",
    "- No dedicated endpoint → `web-scraping` (POST) with `outputFormat: [\"markdown\"]` for LLM context, CSS `extractRules` for known layouts, or `aiExtractRules` for unstructured pages.",
    "",
    "Required rules (validated server-side — violations return HTTP 422):",
    "- `outputFormat` on `web-scraping` is an **array of strings**, e.g. `[\"markdown\"]`, `[\"json\", \"html\"]` — never a bare string.",
    "- `aiExtractRules` value shape per field: `{ type, description?, enum?, output? }`. Supported `type`s: `string | number | boolean | list | item`.",
    "  - Every `list` and `item` MUST include `output`. For a list of scalars use the shorthand `output: \"string\"` (also `\"number\"`, `\"boolean\"`). For a list of objects OR an `item`, use `output: { fieldName: { type, ... }, ... }`.",
    "  - Example — list of pricing plans each with nested scalar list: `{ plans: { type: \"list\", output: { name: { type: \"string\" }, price: { type: \"number\" }, features: { type: \"list\", output: \"string\" } } } }`.",
    "- `extractRules` uses CSS selectors: values are selector strings. Append ` @attr` to pull an attribute (e.g. `\"a @href\"`). Pair with `outputFormat: [\"json\"]` to get the extracted object back.",
    "- Array/filter params (e.g. `homeTypes` on Zillow, `priceMin`/`priceMax`) are already exposed in the ergonomic camelCase form in this schema — do NOT use `price[min]` / `homeTypes[]` raw bracket names; the plugin handles the wire translation.",
    "",
    "Cost & batching:",
    "- Every action lists its credit cost above. Prefer one call with larger `num` / `limit` over many small calls.",
    "- Never call `web-scraping` with `jsRendering: true` when the page is static — JS rendering is slower and still billed the same.",
    "- Leave the defaults on `blockAds: true` and `blockResources: true` unless you specifically need those assets.",
    "",
    "Auth: never place API keys in `params`. The plugin injects `x-api-key` from `plugins.entries.hasdata.config.apiKey` (or `HASDATA_API_KEY`).",
  );

  return lines.join("\n");
}

export function buildToolParameters() {
  return Type.Object(
    {
      action: Type.Union(
        ENDPOINT_SLUGS.map((slug) => Type.Literal(slug)),
        {
          description:
            "HasData endpoint slug. See the tool description for the full catalog with required fields per action.",
        },
      ),
      params: Type.Record(Type.String(), Type.Unknown(), {
        description:
          "Endpoint-specific parameters in camelCase. Required/optional fields and per-action hints are listed in the tool description. Defaults to {}.",
        default: {},
      }),
    },
    {
      additionalProperties: false,
      description:
        "Action + parameters. Pick `action` from the catalog, place its inputs in `params`.",
    },
  );
}

export function createHasDataTool(config: HasDataToolConfig) {
  const apiKey = config.apiKey ?? "";
  const parameters = buildToolParameters();

  return {
    name: "hasdata",
    description: buildToolDescription(),
    parameters,
    async execute(_id: string, input: { action: string; params?: Record<string, unknown> }) {
      if (!apiKey) {
        return errorContent(
          "HasData API key not configured. Set HASDATA_API_KEY or add `apiKey` under `plugins.entries.hasdata.config` in ~/.openclaw/openclaw.json (get one at https://hasdata.com).",
        );
      }

      const action = input.action as EndpointSlug;
      if (!ENDPOINTS[action]) {
        return errorContent(
          `Unknown HasData action "${input.action}". Known actions: ${ENDPOINT_SLUGS.join(", ")}.`,
        );
      }

      const client = new HasDataClient({
        apiKey,
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
        fetch: config.fetch,
        debug: config.debug,
      });

      const params = (input.params ?? {}) as Record<string, unknown>;

      try {
        const result = await client.call(action, params);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        if (err instanceof HasDataError) {
          return errorContent(
            `HasData ${action} failed [${err.kind}${err.status ? ` ${err.status}` : ""}]: ${err.message}`,
          );
        }
        const msg = err instanceof Error ? err.message : String(err);
        return errorContent(`HasData ${action} failed: ${msg}`);
      }
    },
  };
}

function errorContent(text: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text }],
  };
}