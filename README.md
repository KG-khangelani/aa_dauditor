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
- `FIGMA_OAUTH_TOKEN` set in your environment
- A reachable Figma MCP endpoint (`FIGMA_MCP_URL`), either:
  - Hosted (`https://mcp.figma.com/mcp`)
  - Local desktop bridge (`http://127.0.0.1:3845/mcp`)
- If using a local MCP server, keep Figma desktop open with the target file available.

Optional environment variables:

- `FIGMA_MCP_URL` (default `https://mcp.figma.com/mcp`)
- `FIGMA_REGION` (default `us-east-1`)
- `FIGMA_MCP_TIMEOUT_MS` (default `60000`)
- `FIGMA_SUBLAYER_EXPANSION_LIMIT` (default `16`, max key child nodes fetched when design context is truncated)

## Install as Standalone CLI

Install globally from this repo:

```bash
npm install
npm run build
npm link
```

Then run anywhere:

```bash
aa-auditor --help
aa-auditor --version
```

You can also run without global install:

```bash
npm exec -- aa-auditor --help
```

## Initialize Config

```bash
aa-auditor config init
```

This writes `.aa-auditor.yml` with defaults.

## Run an Audit

```bash
aa-auditor audit \
  --url "https://www.figma.com/file/FILE_KEY/Frame?node-id=1-2" \
  --out ./out
```

Multi-target run:

```bash
aa-auditor audit \
  --url "https://www.figma.com/file/FILE_KEY/A?node-id=1-2" \
  --url "https://www.figma.com/file/FILE_KEY/B?node-id=10-2" \
  --out ./out
```

## MCP Health Check

Run a fast MCP preflight before audits:

```bash
aa-auditor health --url "https://www.figma.com/design/FILE_KEY/Frame?node-id=1-2"
```

You can also run without a URL to validate MCP initialization only:

```bash
aa-auditor health
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
- `aa-auditor health [--url <figma_url>]`
- `aa-auditor rules list`
- `aa-auditor config init [--path <path>] [--force]`

## Testing

```bash
npm test
```

Tests include unit checks for color math, rule behavior, suppressions, severity policy, and fixture-driven integration runs.
