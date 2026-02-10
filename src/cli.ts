#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig } from "./config/load.js";
import { createDefaultConfigYaml } from "./config/schema.js";
import { runAudit } from "./core/auditRunner.js";
import { RULE_CATALOG } from "./core/ruleCatalog.js";
import type { ReportFormat, Severity } from "./core/types.js";
import {
  createFigmaClientFromEnv,
  runFigmaMcpHealthCheck,
} from "./figma/mcpClient.js";

void main();

async function main(): Promise<void> {
  const command = process.argv[2];

  try {
    if (command === "audit") {
      await runAuditCommand(process.argv.slice(3));
      return;
    }

    if (command === "health") {
      await runHealthCommand(process.argv.slice(3));
      return;
    }

    if (command === "rules" && process.argv[3] === "list") {
      runRulesListCommand();
      return;
    }

    if (command === "config" && process.argv[3] === "init") {
      runConfigInitCommand(process.argv.slice(4));
      return;
    }

    printUsage();
    process.exitCode = 1;
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

async function runAuditCommand(args: string[]): Promise<void> {
  const parsed = parseAuditArgs(args);

  const { config, source } = loadConfig(parsed.configPath);

  const reportFormat =
    parsed.format ?? inferReportFormatFromConfig(config.report.formats);

  const failOn = parsed.failOn ?? config.failOn;

  const figmaClient = createFigmaClientFromEnv();

  const result = await runAudit(
    {
      targets: parsed.urls.map((figmaUrl) => ({ figmaUrl })),
      outDir: resolve(parsed.outDir),
      config,
      reportFormat,
      failOn,
    },
    {
      figmaClient,
      now: () => new Date(),
      runIdFactory: () => randomUUID(),
    },
  );

  console.log(`Config source: ${source}`);
  if (result.jsonPath) {
    console.log(`JSON report: ${result.jsonPath}`);
  }
  if (result.htmlPath) {
    console.log(`HTML report: ${result.htmlPath}`);
  }

  console.log(
    `Summary: ${result.report.summary.totalFindings} findings, ${result.report.summary.manualReviewFindings} manual-review items, ${result.report.summary.warnings.length} warnings.`,
  );

  if (result.report.summary.warnings.length > 0) {
    console.warn("Warnings:");
    for (const warning of result.report.summary.warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (result.shouldFail) {
    process.exitCode = 2;
  } else {
    process.exitCode = 0;
  }
}

async function runHealthCommand(args: string[]): Promise<void> {
  const parsed = parseHealthArgs(args);
  const result = await runFigmaMcpHealthCheck(parsed.url);

  console.log(`MCP endpoint: ${result.endpoint}`);
  console.log(`Status: ${result.status.toUpperCase()}`);
  console.log("Checks:");
  for (const check of result.checks) {
    console.log(`- [${check.status.toUpperCase()}] ${check.name}: ${check.message}`);
  }

  if (result.suggestions.length > 0) {
    console.log("Next steps:");
    for (const suggestion of result.suggestions) {
      console.log(`- ${suggestion}`);
    }
  }

  process.exitCode = result.status === "fail" ? 1 : 0;
}

function runRulesListCommand(): void {
  for (const rule of RULE_CATALOG) {
    console.log(`${rule.id} [${rule.defaultSeverity}]`);
    console.log(`  WCAG ${rule.wcagCriterion}: ${rule.title}`);
    console.log(`  ${rule.description}`);
  }
}

function runConfigInitCommand(args: string[]): void {
  let targetPath = ".aa-auditor.yml";
  let force = false;

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--path") {
      targetPath = requireValue(args[i + 1], "--path");
      i += 1;
      continue;
    }
    if (token === "--force") {
      force = true;
      continue;
    }

    throw new Error(`Unknown config init option: ${token}`);
  }

  const resolved = resolve(targetPath);

  if (existsSync(resolved) && !force) {
    throw new Error(
      `Config already exists at ${resolved}. Re-run with --force to overwrite.`,
    );
  }

  writeFileSync(resolved, createDefaultConfigYaml(), "utf8");
  console.log(`Wrote config template: ${resolved}`);
}

function parseAuditArgs(args: string[]): {
  urls: string[];
  outDir: string;
  configPath?: string;
  format?: ReportFormat;
  failOn?: Severity[];
} {
  const urls: string[] = [];
  let outDir: string | undefined;
  let configPath: string | undefined;
  let format: ReportFormat | undefined;
  let failOn: Severity[] | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];

    if (token === "--url") {
      urls.push(requireValue(args[i + 1], "--url"));
      i += 1;
      continue;
    }

    if (token === "--out") {
      outDir = requireValue(args[i + 1], "--out");
      i += 1;
      continue;
    }

    if (token === "--config") {
      configPath = requireValue(args[i + 1], "--config");
      i += 1;
      continue;
    }

    if (token === "--format") {
      const value = requireValue(args[i + 1], "--format");
      if (value !== "json" && value !== "html" && value !== "both") {
        throw new Error("--format must be one of: json, html, both.");
      }
      format = value;
      i += 1;
      continue;
    }

    if (token === "--fail-on") {
      const value = requireValue(args[i + 1], "--fail-on");
      failOn = parseSeverityCsv(value);
      i += 1;
      continue;
    }

    throw new Error(`Unknown audit option: ${token}`);
  }

  if (urls.length === 0) {
    throw new Error("At least one --url argument is required.");
  }

  if (!outDir) {
    throw new Error("--out is required.");
  }

  return {
    urls,
    outDir,
    configPath,
    format,
    failOn,
  };
}

function parseSeverityCsv(value: string): Severity[] {
  const entries = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    throw new Error("--fail-on must contain at least one severity.");
  }

  const valid: Severity[] = ["blocker", "critical", "major", "minor"];
  const parsed: Severity[] = [];

  for (const entry of entries) {
    if (!valid.includes(entry as Severity)) {
      throw new Error(`Invalid severity in --fail-on: ${entry}`);
    }
    parsed.push(entry as Severity);
  }

  return Array.from(new Set(parsed));
}

function parseHealthArgs(args: string[]): {
  url?: string;
} {
  let url: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];

    if (token === "--url") {
      url = requireValue(args[i + 1], "--url");
      i += 1;
      continue;
    }

    throw new Error(`Unknown health option: ${token}`);
  }

  return { url };
}

function inferReportFormatFromConfig(
  formats: Array<"json" | "html">,
): ReportFormat {
  const set = new Set(formats);
  if (set.has("json") && set.has("html")) {
    return "both";
  }
  if (set.has("json")) {
    return "json";
  }
  return "html";
}

function requireValue(value: string | undefined, flagName: string): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flagName} requires a value.`);
  }
  return value;
}

function printUsage(): void {
  console.log(`aa-auditor

Commands:
  aa-auditor audit --url <figma_url> [--url ...] --out <dir> [--config <path>] [--format json|html|both] [--fail-on blocker,critical]
  aa-auditor health [--url <figma_url>]
  aa-auditor rules list
  aa-auditor config init [--path <path>] [--force]
`);
}
