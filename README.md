# AA Auditor

`aa-auditor` is a TypeScript CLI that audits Figma frame/layer URLs against core **WCAG 2.2 AA** design checks.

## Features

- Figma MCP-backed input (`get_design_context`, metadata fallback, `get_screenshot`)
- Smart sublayer expansion when top-level design context is too large (auto-fetches key child nodes)
- Auto-import of Figma design-system color variables (`get_variable_defs`) for contrast recommendations
- Automated checks:
  - `WCAG-1.4.3-text-contrast-minimum`
  - `WCAG-1.4.11-nontext-contrast`
  - `WCAG-2.5.8-target-size-minimum`
- Embedded manual checklist items in both JSON and HTML
- Suppressions with required reason + expiry
- CI gating via non-zero exit code when configured severities are present

## Prerequisites

- Node.js 20+
- Figma MCP configuration in Codex (`~/.codex/config.toml`)
- `FIGMA_OAUTH_TOKEN` set in your environment
- If using a local Figma MCP server (for example `http://127.0.0.1:3845/mcp`), keep the Figma desktop app open with the target file available; otherwise MCP calls can fail with `No Figma window open`.

Optional environment variables:

- `FIGMA_MCP_URL` (default `https://mcp.figma.com/mcp`; for local endpoints like `http://127.0.0.1:3845/mcp`, Figma desktop must be open)
- `FIGMA_REGION` (default `us-east-1`)
- `FIGMA_MCP_TIMEOUT_MS` (default `60000`)
- `FIGMA_SUBLAYER_EXPANSION_LIMIT` (default `16`, max key child nodes fetched when design context is truncated)

## Install and Build

```bash
npm install
npm run build
```

## Initialize Config

```bash
node dist/src/cli.js config init
```

This writes `.aa-auditor.yml` with defaults.

## Run an Audit

```bash
node dist/src/cli.js audit \
  --url "https://www.figma.com/file/FILE_KEY/Frame?node-id=1-2" \
  --out ./out
```

Multi-target run:

```bash
node dist/src/cli.js audit \
  --url "https://www.figma.com/file/FILE_KEY/A?node-id=1-2" \
  --url "https://www.figma.com/file/FILE_KEY/B?node-id=10-2" \
  --out ./out
```

### Output

- JSON: `out/audit-report.json`
- HTML: `out/audit-report.html`
- Assets: `out/assets/*` when screenshot bytes are available

### Design-system color recommendations

For color contrast findings, the auditor recommends passing tokens from your design system.

By default, it pulls color variables from Figma via `get_variable_defs`.

You can also define or override tokens in `.aa-auditor.yml`:

```yaml
designSystemColors:
  text.primary: "#1F2937"
  text.inverse: "#FFFFFF"
  border.default: "#CBD5E1"
```

When a text/non-text contrast rule fails, the report includes variable-aware fix suggestions:

- `Fix A`: swap foreground to a passing design-system variable.
- `Fix B`: swap background to a passing design-system variable (opaque tokens only).
- `Fix C`: swap both foreground and background to the closest passing variable pair.

### Exit codes

- `0`: audit succeeded and no gate-triggering violations
- `2`: violations found that match `failOn` policy
- `1`: runtime/config/fetch error

## Commands

- `aa-auditor audit --url <figma_url> [--url ...] --out <dir> [--config <path>] [--format json|html|both] [--fail-on blocker,critical]`
- `aa-auditor rules list`
- `aa-auditor config init [--path <path>] [--force]`

## Testing

```bash
npm test
```

Tests include unit checks for color math, rule behavior, suppressions, severity policy, and fixture-driven integration runs.
