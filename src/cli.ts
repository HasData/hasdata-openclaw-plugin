import { HasDataClient, HasDataError } from "./client.js";

interface CommanderLike {
  command(name: string): CommanderCommand;
}

interface CommanderCommand {
  description(text: string): CommanderCommand;
  option(flag: string, description?: string, defaultValue?: unknown): CommanderCommand;
  argument(name: string, description?: string): CommanderCommand;
  action(handler: (...args: any[]) => unknown): CommanderCommand;
  command(name: string): CommanderCommand;
}

interface PluginApiLike {
  pluginConfig?: Record<string, unknown>;
  runtime?: {
    config?: {
      loadConfig?: () => Promise<any>;
      writeConfigFile?: (cfg: any) => Promise<void>;
    };
  };
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
}

export function registerHasDataCli(opts: {
  program: CommanderLike;
  api: PluginApiLike;
}) {
  const { program, api } = opts;

  const root = program
    .command("hasdata")
    .description("HasData plugin — setup, status, and smoke tests");

  root
    .command("setup")
    .description("Write HasData API key into ~/.openclaw/openclaw.json")
    .option("--api-key <key>", "HasData API key (falls back to HASDATA_API_KEY env)")
    .option("--base-url <url>", "Override the HasData base URL (default: https://api.hasdata.com)")
    .action(async (options: { apiKey?: string; baseUrl?: string }) => {
      const apiKey = options.apiKey ?? process.env.HASDATA_API_KEY;
      if (!apiKey) {
        console.error(
          "No API key provided. Pass --api-key or set HASDATA_API_KEY. Get a key at https://hasdata.com.",
        );
        process.exitCode = 1;
        return;
      }

      const cfgApi = api.runtime?.config;
      if (!cfgApi?.loadConfig || !cfgApi.writeConfigFile) {
        console.error("Runtime config API not available in this context.");
        process.exitCode = 1;
        return;
      }

      const cfg = await cfgApi.loadConfig();
      cfg.plugins ??= {};
      cfg.plugins.entries ??= {};
      cfg.plugins.entries.hasdata ??= {};
      cfg.plugins.entries.hasdata.enabled = true;
      cfg.plugins.entries.hasdata.config ??= {};
      cfg.plugins.entries.hasdata.config.apiKey = apiKey;
      if (options.baseUrl) {
        cfg.plugins.entries.hasdata.config.baseUrl = options.baseUrl;
      }
      await cfgApi.writeConfigFile(cfg);
      console.log("HasData plugin configured. Restart the OpenClaw gateway to apply.");
    });

  root
    .command("status")
    .description("Show the currently-loaded HasData plugin config")
    .action(() => {
      const cfg = api.pluginConfig ?? {};
      const masked = { ...cfg };
      if (typeof masked.apiKey === "string" && masked.apiKey.length > 6) {
        masked.apiKey = masked.apiKey.slice(0, 4) + "…" + masked.apiKey.slice(-2);
      }
      console.log(JSON.stringify(masked, null, 2));
    });

  root
    .command("test")
    .description("Run a cheap google-serp-light smoke test against the HasData API")
    .option("--query <q>", "search query", "openclaw")
    .action(async (options: { query: string }) => {
      const apiKey =
        (api.pluginConfig?.apiKey as string | undefined) ??
        process.env.HASDATA_API_KEY;
      if (!apiKey) {
        console.error("No API key available. Run `openclaw hasdata setup` first.");
        process.exitCode = 1;
        return;
      }
      const baseUrl = api.pluginConfig?.baseUrl as string | undefined;
      const client = new HasDataClient({ apiKey, baseUrl });
      try {
        const result = (await client.call("google-serp-light", {
          q: options.query,
        })) as { organicResults?: unknown[] };
        const n = Array.isArray(result.organicResults)
          ? result.organicResults.length
          : 0;
        console.log(`OK — google-serp-light returned ${n} organic results for "${options.query}".`);
      } catch (err) {
        if (err instanceof HasDataError) {
          console.error(`FAIL [${err.kind}${err.status ? ` ${err.status}` : ""}]: ${err.message}`);
        } else {
          console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
        }
        process.exitCode = 1;
      }
    });
}