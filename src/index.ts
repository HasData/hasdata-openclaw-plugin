import { createHasDataTool } from "./tools/hasdata-tool.js";
import { registerHasDataCli } from "./cli.js";

interface OpenClawPluginApi {
  id?: string;
  pluginConfig?: Record<string, unknown>;
  runtime?: unknown;
  logger?: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
  registerTool: (tool: unknown, opts?: { optional?: boolean }) => void;
  registerCli?: (
    registrar: (ctx: { program: unknown }) => void | Promise<void>,
    opts?: { descriptors?: { name: string; description?: string; hasSubcommands?: boolean }[] },
  ) => void;
}

export default {
  id: "hasdata",
  name: "HasData",
  description:
    "Real-time web data via HasData — Google SERP, Google Maps, Amazon, Zillow, Redfin, Airbnb, Yelp, Indeed, Bing, and arbitrary URL scraping.",
  register(api: OpenClawPluginApi) {
    const cfg = (api.pluginConfig ?? {}) as {
      enabled?: boolean;
      apiKey?: string;
      baseUrl?: string;
      timeoutMs?: number;
    };

    if (cfg.enabled === false) return;

    // Resolve the API key exactly once at plugin load. Priority:
    //   1. openclaw config (plugins.entries.hasdata.config.apiKey)
    //   2. HASDATA_API_KEY environment variable (advertised fallback)
    // Declared in openclaw.plugin.json → providerAuthEnvVars so the registry
    // scanner knows this env var is part of the credential contract.
    const apiKey = cfg.apiKey ?? process.env.HASDATA_API_KEY ?? "";

    const tool = createHasDataTool({
      apiKey,
      baseUrl: cfg.baseUrl,
      timeoutMs: cfg.timeoutMs,
    });
    api.registerTool(tool);

    api.registerCli?.(
      async ({ program }) => {
        registerHasDataCli({ program: program as any, api: api as any });
      },
      {
        descriptors: [
          {
            name: "hasdata",
            description: "HasData plugin — setup, status, and smoke tests",
            hasSubcommands: true,
          },
        ],
      },
    );
  },
};
