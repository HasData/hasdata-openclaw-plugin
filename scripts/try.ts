#!/usr/bin/env tsx
/**
 * Local runner for the hasdata tool — no OpenClaw needed.
 *
 * Usage:
 *   npm run try -- <action> '<paramsJson>' [--dry-run] [--raw]
 *   npm run try -- list
 *
 * Examples:
 *   HASDATA_API_KEY=hd_xxx npm run try -- google-serp '{"q":"coffee","num":5}'
 *   HASDATA_API_KEY=hd_xxx npm run try -- --dry-run google-serp '{"q":"coffee"}'
 *   HASDATA_DEBUG=1 HASDATA_API_KEY=hd_xxx npm run try -- amazon-product '{"asin":"B08N5WRWNW"}'
 *   npm run try -- list
 */
import { createHasDataTool } from "../src/tools/hasdata-tool.js";
import { HasDataClient } from "../src/client.js";
import {
  ENDPOINTS,
  ENDPOINT_SLUGS,
  type EndpointSlug,
} from "../src/endpoints.generated.js";

interface Args {
  action?: string;
  paramsJson?: string;
  dryRun: boolean;
  raw: boolean;
  list: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false, raw: false, list: false };
  const positional: string[] = [];
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--raw") out.raw = true;
    else if (a === "list" || a === "--list") out.list = true;
    else positional.push(a);
  }
  out.action = positional[0];
  out.paramsJson = positional[1];
  return out;
}

function printEndpointList() {
  const byCategory = new Map<string, EndpointSlug[]>();
  for (const slug of ENDPOINT_SLUGS) {
    const cat = ENDPOINTS[slug].category || "Other";
    const arr = byCategory.get(cat);
    if (arr) arr.push(slug);
    else byCategory.set(cat, [slug]);
  }
  for (const [cat, slugs] of byCategory) {
    console.log(`\n${cat}`);
    for (const s of slugs) {
      const ep = ENDPOINTS[s];
      const req = ep.required.length > 0 ? `  required: ${ep.required.join(", ")}` : "";
      console.log(`  ${s.padEnd(32)} ${ep.method} ${ep.path}  (${ep.cost}cr)${req}`);
    }
  }
  console.log(`\n${ENDPOINT_SLUGS.length} endpoints total.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list || !args.action) {
    if (!args.list && !args.action) {
      console.error(
        "Usage: npm run try -- <action> '<paramsJson>' [--dry-run] [--raw]\n" +
          "       npm run try -- list\n",
      );
    }
    printEndpointList();
    if (!args.list && !args.action) process.exitCode = 1;
    return;
  }

  const action = args.action;
  if (!(action in ENDPOINTS)) {
    console.error(`Unknown action "${action}". Run \`npm run try -- list\` to see all.`);
    process.exitCode = 1;
    return;
  }
  const slug = action as EndpointSlug;

  let params: Record<string, unknown> = {};
  if (args.paramsJson) {
    try {
      params = JSON.parse(args.paramsJson);
    } catch (err) {
      console.error(`Invalid JSON for params: ${err instanceof Error ? err.message : err}`);
      process.exitCode = 1;
      return;
    }
  }

  // Dry-run: no API key required, no network.
  if (args.dryRun) {
    const client = new HasDataClient({ apiKey: "DRY_RUN_KEY" });
    const req = client.buildRequest(slug, params);
    console.log(`${req.method} ${req.url}`);
    if (req.body) console.log(`body: ${req.body}`);
    return;
  }

  const apiKey = process.env.HASDATA_API_KEY;
  if (!apiKey) {
    console.error("HASDATA_API_KEY not set. Either export it or pass --dry-run.");
    process.exitCode = 1;
    return;
  }

  // Live path — go through the tool so we exercise the same code the
  // OpenClaw runtime would. Toggle debug logs with HASDATA_DEBUG=1.
  const tool = createHasDataTool({ apiKey });
  const result = (await tool.execute("try", { action: slug, params })) as {
    isError?: boolean;
    content: { type: string; text: string }[];
  };

  if (result.isError) {
    console.error(result.content[0]?.text ?? "unknown error");
    process.exitCode = 1;
    return;
  }

  const text = result.content[0]?.text ?? "";
  if (args.raw) {
    process.stdout.write(text);
    return;
  }

  // Pretty path — parse JSON and show a compact summary; `--raw` dumps the full body.
  try {
    const parsed = JSON.parse(text);
    const size = text.length;
    const topKeys = Array.isArray(parsed) ? ["<array>"] : Object.keys(parsed);
    console.log(`ok — ${size}B JSON response`);
    console.log(`top-level keys: ${topKeys.join(", ")}`);
    const preview = JSON.stringify(parsed, null, 2);
    console.log(preview.length > 2000 ? preview.slice(0, 2000) + "\n… (truncated — use --raw for full output)" : preview);
  } catch {
    process.stdout.write(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});