import { afterEach, describe, expect, it, vi } from "vitest";
import { createHasDataTool } from "../src/tools/hasdata-tool.js";
import { ENDPOINT_SLUGS } from "../src/endpoints.generated.js";

function mockFetch(response: {
  status?: number;
  body?: unknown;
  text?: string;
}): typeof fetch {
  return vi.fn(async () => {
    const status = response.status ?? 200;
    const text =
      response.text ??
      (response.body !== undefined ? JSON.stringify(response.body) : "");
    return new Response(text, {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("hasdata tool", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("registers under the name 'hasdata' with the expected shape", () => {
    const tool = createHasDataTool({ apiKey: "test" });
    expect(tool.name).toBe("hasdata");
    expect(tool.description).toContain("HasData");
    expect(tool.parameters).toBeDefined();
  });

  it("exposes every endpoint as a discriminated-union branch", () => {
    const tool = createHasDataTool({ apiKey: "test" });
    const branches = (tool.parameters as any).anyOf as Array<{
      properties: { action: { const: string } };
    }>;
    const actionValues = branches.map((b) => b.properties.action.const);
    for (const slug of ENDPOINT_SLUGS) {
      expect(actionValues).toContain(slug);
    }
  });

  it("each branch carries a per-action params schema with proper required fields", () => {
    const tool = createHasDataTool({ apiKey: "test" });
    const branches = (tool.parameters as any).anyOf as Array<any>;
    const serpBranch = branches.find(
      (b) => b.properties.action.const === "google-serp",
    );
    expect(serpBranch).toBeDefined();
    expect(serpBranch.properties.params.type).toBe("object");
    expect(serpBranch.properties.params.properties).toHaveProperty("q");
  });

  it("calls the correct GET URL with x-api-key header", async () => {
    const fetchSpy = mockFetch({ body: { organicResults: [{ title: "hi" }] } });
    const tool = createHasDataTool({ apiKey: "key123", fetch: fetchSpy });

    const result = await tool.execute("1", {
      action: "google-serp",
      params: { q: "hello", gl: "us" },
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = (fetchSpy as any).mock.calls[0];
    expect(url).toContain("https://api.hasdata.com/scrape/google/serp");
    expect(url).toContain("q=hello");
    expect(url).toContain("gl=us");
    expect(init.method).toBe("GET");
    expect(init.headers["x-api-key"]).toBe("key123");
    expect((result as any).content[0].text).toContain("organicResults");
  });

  it("POSTs JSON body for web-scraping", async () => {
    const fetchSpy = mockFetch({ body: { html: "<html/>" } });
    const tool = createHasDataTool({ apiKey: "k", fetch: fetchSpy });

    await tool.execute("1", {
      action: "web-scraping",
      params: { url: "https://example.com", outputFormat: ["markdown"] },
    });

    const [url, init] = (fetchSpy as any).mock.calls[0];
    expect(url).toBe("https://api.hasdata.com/scrape/web");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body.url).toBe("https://example.com");
    expect(body.outputFormat).toEqual(["markdown"]);
  });

  it("maps ergonomic camelCase to HasData bracket wire names", async () => {
    const fetchSpy = mockFetch({ body: {} });
    const tool = createHasDataTool({ apiKey: "k", fetch: fetchSpy });

    await tool.execute("1", {
      action: "zillow-listing",
      params: {
        keyword: "Austin, TX",
        type: "forSale",
        priceMin: 400000,
        priceMax: 900000,
        bedsMin: 3,
        homeTypes: ["house", "townhome"],
      },
    });

    const [url] = (fetchSpy as any).mock.calls[0];
    // priceMin → price[min], bedsMin → beds[min], homeTypes → homeTypes[]
    expect(url).toContain("price%5Bmin%5D=400000");
    expect(url).toContain("price%5Bmax%5D=900000");
    expect(url).toContain("beds%5Bmin%5D=3");
    expect(url).toContain("homeTypes%5B%5D=house");
    expect(url).toContain("homeTypes%5B%5D=townhome");
    // Scalars pass through as-is.
    expect(url).toContain("type=forSale");
    // The camelCase form must NOT leak onto the wire.
    expect(url).not.toContain("priceMin=");
    expect(url).not.toContain("bedsMin=");
  });

  it("leaves unknown param keys untouched (forward-compat)", async () => {
    const fetchSpy = mockFetch({ body: {} });
    const tool = createHasDataTool({ apiKey: "k", fetch: fetchSpy });

    await tool.execute("1", {
      action: "google-serp",
      params: { q: "x", somethingNew: "v" },
    });

    const [url] = (fetchSpy as any).mock.calls[0];
    expect(url).toContain("somethingNew=v");
  });

  it("returns isError when API key is missing", async () => {
    // Sandbox the env — vitest restores on afterEach so we don't mutate the
    // runner's real process.env.
    vi.stubEnv("HASDATA_API_KEY", "");

    const tool = createHasDataTool({ apiKey: "" });
    const result = await tool.execute("1", {
      action: "google-serp",
      params: { q: "x" },
    });
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toMatch(/API key/i);
  });

  it("returns isError on 401", async () => {
    const fetchSpy = mockFetch({ status: 401, text: "unauthorized" });
    const tool = createHasDataTool({ apiKey: "bad", fetch: fetchSpy });

    const result = await tool.execute("1", {
      action: "google-serp",
      params: { q: "x" },
    });
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toMatch(/auth/i);
  });

  it("returns isError on 4xx with body", async () => {
    const fetchSpy = mockFetch({ status: 422, text: "missing q param" });
    const tool = createHasDataTool({ apiKey: "k", fetch: fetchSpy });

    const result = await tool.execute("1", {
      action: "google-serp",
      params: {},
    });
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toMatch(/422/);
  });
});