import {
  ENDPOINTS,
  type EndpointSlug,
  type EndpointSpec,
} from "./endpoints.generated.js";

export interface HasDataClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  userAgent?: string;
  debug?: boolean;
}

export interface BuiltRequest {
  action: EndpointSlug;
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export class HasDataError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "network" | "client" | "server" | "invalid",
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "HasDataError";
  }
}

const DEFAULT_BASE_URL = "https://api.hasdata.com";
const DEFAULT_TIMEOUT_MS = 120_000;

export class HasDataClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly userAgent: string;
  private readonly debug: boolean;

  constructor(cfg: HasDataClientConfig) {
    if (!cfg.apiKey) {
      throw new HasDataError("HasData API key is required", "auth");
    }
    this.apiKey = cfg.apiKey;
    this.baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn = cfg.fetch ?? globalThis.fetch;
    this.userAgent = cfg.userAgent ?? "hasdata-openclaw-plugin";
    this.debug = cfg.debug ?? process.env.HASDATA_DEBUG === "1";
  }

  buildRequest(
    slug: EndpointSlug,
    params: Record<string, unknown>,
  ): BuiltRequest {
    const endpoint = ENDPOINTS[slug] as EndpointSpec | undefined;
    if (!endpoint) {
      throw new HasDataError(`Unknown HasData action: ${slug}`, "invalid");
    }

    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      "x-request-source": this.userAgent,
      "User-Agent": this.userAgent,
      Accept: "application/json",
    };

    let url = this.baseUrl + endpoint.path;
    let body: string | undefined;

    if (endpoint.method === "GET") {
      const qs = buildQueryString(params, endpoint);
      if (qs) url += (url.includes("?") ? "&" : "?") + qs;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(params ?? {});
    }

    return { action: slug, method: endpoint.method, url, headers, body };
  }

  async call(
    slug: EndpointSlug,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const req = this.buildRequest(slug, params);

    const init: RequestInit = { method: req.method, headers: req.headers };
    if (req.body !== undefined) init.body = req.body;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    init.signal = controller.signal;

    if (this.debug) {
      const masked = {
        ...req.headers,
        "x-api-key": maskKey(this.apiKey),
      };
      process.stderr.write(
        `[hasdata] → ${req.method} ${req.url}\n[hasdata]   headers ${JSON.stringify(masked)}\n`,
      );
      if (req.body) {
        process.stderr.write(`[hasdata]   body ${req.body}\n`);
      }
    }

    const t0 = Date.now();
    let res: Response;
    try {
      res = await this.fetchFn(req.url, init);
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      throw new HasDataError(`network error: ${msg}`, "network");
    }
    clearTimeout(timer);

    const text = await res.text();
    if (this.debug) {
      const ms = Date.now() - t0;
      process.stderr.write(
        `[hasdata] ← ${res.status} ${res.headers.get("content-type") ?? ""} (${ms}ms, ${text.length}B)\n`,
      );
      const rateLimit = res.headers.get("x-ratelimit-remaining");
      const credits = res.headers.get("x-ratelimit-limit");
      if (rateLimit || credits) {
        process.stderr.write(
          `[hasdata]   credits ${rateLimit ?? "?"}/${credits ?? "?"}\n`,
        );
      }
    }

    if (res.status === 401 || res.status === 403) {
      throw new HasDataError(
        `HasData auth failed (${res.status}) — check HASDATA_API_KEY`,
        "auth",
        res.status,
        text,
      );
    }
    if (res.status >= 500) {
      throw new HasDataError(
        `HasData server error ${res.status}`,
        "server",
        res.status,
        text,
      );
    }
    if (res.status >= 400) {
      throw new HasDataError(
        `HasData request rejected (${res.status}): ${text.slice(0, 500)}`,
        "client",
        res.status,
        text,
      );
    }

    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
}

function maskKey(k: string): string {
  if (!k) return "";
  if (k.length <= 8) return "***";
  return `${k.slice(0, 4)}…${k.slice(-2)}`;
}

function buildQueryString(
  params: Record<string, unknown>,
  endpoint: EndpointSpec,
): string {
  const qp = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) continue;
    // Translate the ergonomic schema name (e.g. `priceMin`, `homeTypes`) to
    // the HasData wire name (e.g. `price[min]`, `homeTypes[]`). Unknown keys
    // fall through unchanged — forwards-compatible with newer APIs not yet
    // in the generated schema, and still lets callers pass explicit wire
    // names if they want to.
    const wire = endpoint.properties[key]?.wireName ?? key;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v === undefined || v === null) continue;
        // `wire` already contains `[]` for array params (e.g. `homeTypes[]`);
        // don't double-wrap.
        qp.append(wire, String(v));
      }
    } else if (typeof value === "object") {
      qp.append(wire, JSON.stringify(value));
    } else {
      qp.append(wire, String(value));
    }
  }
  return qp.toString();
}