# Security

## Network boundary

The plugin only sends HTTP requests to **`https://api.hasdata.com`**. No telemetry, no analytics, no third-party hosts. The base URL is overridable via `plugins.entries.hasdata.config.baseUrl` solely so you can point at a staging or proxy instance you control; there is no environment variable or external input that can redirect outbound requests.

No outbound requests are made at plugin load time. Network I/O happens only when an agent actively invokes the `hasdata` tool.

## Credentials

The plugin reads a HasData API key from one of two places, in priority order:

1. `plugins.entries.hasdata.config.apiKey` in `~/.openclaw/openclaw.json`
2. The `HASDATA_API_KEY` environment variable

The value is used as the `x-api-key` header on HasData API requests and is never logged, cached, or forwarded elsewhere. The env-var fallback is the **only** environment variable the plugin reads at runtime.

If you store the key in the OpenClaw config file, `chmod 600 ~/.openclaw/openclaw.json` so other users on the machine cannot read it. For ephemeral environments (CI, containers) prefer the env var — it leaves no on-disk footprint.

## Scope of reads

The plugin does not read your filesystem, shell history, browser data, or any other local credential store. It never parses files outside its own installation directory.

## Telemetry and analytics

None. The plugin does not phone home. The `x-request-source: hasdata-openclaw-plugin` header on HasData API calls is informational (HasData uses it for usage analytics on their side); it does not leak plugin or host identity.

## Dev-only scripts

`scripts/generate-endpoints.mjs` fetches from a hardcoded `https://api.hasdata.com/apis` URL to refresh the generated schema file. It runs only when you invoke `npm run generate` locally — it is not part of the installed plugin and is not included in the published npm tarball.

`scripts/try.ts` is a local test harness that also reaches only `https://api.hasdata.com` via the same client code the runtime uses. It is likewise not shipped.

## Supply chain

Every npm release carries a [provenance attestation](https://docs.npmjs.com/generating-provenance-statements) linking the tarball to the exact GitHub Actions build that produced it — click the "Provenance" badge on the [npm page](https://www.npmjs.com/package/@hasdata/hasdata-openclaw-plugin) to see which commit, workflow run, and runner image signed the release. Attestations are published to the public [sigstore transparency log](https://search.sigstore.dev/).

Runtime dependencies at publish time are only `@sinclair/typebox` (schema builder). See `package.json` for the live list.

## Reporting

Report security issues to **support@hasdata.com**. Please do not file public GitHub issues for vulnerabilities — email first so we can coordinate a fix before disclosure.