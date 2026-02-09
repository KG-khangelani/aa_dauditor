import { RULE_CATALOG } from "../core/ruleCatalog.js";
import type { AppConfig, RuleConfig, Severity, Suppression } from "../core/types.js";
import { isValidHexColor } from "../rules/recommend-color.js";

const VALID_SEVERITIES: Severity[] = ["blocker", "critical", "major", "minor"];

const DEFAULT_RULES: Record<string, RuleConfig> = Object.fromEntries(
  RULE_CATALOG.map((rule) => [
    rule.id,
    {
      enabled: true,
      severity: rule.defaultSeverity,
    },
  ]),
);

export const DEFAULT_CONFIG: AppConfig = {
  wcagVersion: "2.2",
  level: "AA",
  failOn: ["blocker", "critical"],
  report: {
    includeScreenshots: true,
    formats: ["json", "html"],
  },
  rules: DEFAULT_RULES,
  suppressions: [],
  designSystemColors: {},
};

export function createDefaultConfigYaml(): string {
  return [
    'wcagVersion: "2.2"',
    'level: "AA"',
    "failOn:",
    "  - blocker",
    "  - critical",
    "report:",
    "  includeScreenshots: true",
    "  formats:",
    "    - json",
    "    - html",
    "rules:",
    ...RULE_CATALOG.flatMap((rule) => [
      `  ${rule.id}:`,
      "    enabled: true",
      `    severity: ${rule.defaultSeverity}`,
    ]),
    "designSystemColors: {}",
    "suppressions: []",
    "",
  ].join("\n");
}

export function validateAndNormalizeConfig(input: unknown): AppConfig {
  if (!isObject(input)) {
    throw new Error("Config root must be a YAML object.");
  }

  const wcagVersion = input.wcagVersion ?? DEFAULT_CONFIG.wcagVersion;
  if (wcagVersion !== "2.2") {
    throw new Error("wcagVersion must be exactly \"2.2\" for this MVP.");
  }

  const level = input.level ?? DEFAULT_CONFIG.level;
  if (level !== "AA") {
    throw new Error("level must be exactly \"AA\" for this MVP.");
  }

  const failOn = normalizeSeverityList(input.failOn, "failOn", DEFAULT_CONFIG.failOn);

  const reportValue = isObject(input.report) ? input.report : {};
  const includeScreenshots =
    typeof reportValue.includeScreenshots === "boolean"
      ? reportValue.includeScreenshots
      : DEFAULT_CONFIG.report.includeScreenshots;
  const formats = normalizeReportFormats(
    reportValue.formats,
    DEFAULT_CONFIG.report.formats,
  );

  const rules = normalizeRules(input.rules);
  const suppressions = normalizeSuppressions(input.suppressions);
  const designSystemColors = normalizeDesignSystemColors(input.designSystemColors);

  return {
    wcagVersion,
    level,
    failOn,
    report: {
      includeScreenshots,
      formats,
    },
    rules,
    suppressions,
    designSystemColors,
  };
}

function normalizeDesignSystemColors(value: unknown): Record<string, string> {
  if (value === undefined) {
    return {};
  }

  if (!isObject(value)) {
    throw new Error("designSystemColors must be an object of token->hex color.");
  }

  const out: Record<string, string> = {};
  for (const [token, raw] of Object.entries(value)) {
    const tokenName = token.trim();
    if (!tokenName) {
      throw new Error("designSystemColors contains an empty token name.");
    }
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new Error(`designSystemColors.${tokenName} must be a non-empty hex string.`);
    }
    if (!isValidHexColor(raw)) {
      throw new Error(
        `designSystemColors.${tokenName} must be a valid hex color (#RGB, #RGBA, #RRGGBB, or #RRGGBBAA).`,
      );
    }
    out[tokenName] = raw.trim();
  }

  return out;
}

function normalizeRules(value: unknown): Record<string, RuleConfig> {
  const base: Record<string, RuleConfig> = Object.fromEntries(
    Object.entries(DEFAULT_RULES).map(([ruleId, cfg]) => [ruleId, { ...cfg }]),
  );

  if (value === undefined) {
    return base;
  }

  if (!isObject(value)) {
    throw new Error("rules must be an object keyed by rule ID.");
  }

  for (const [ruleId, maybeRule] of Object.entries(value)) {
    if (!isObject(maybeRule)) {
      throw new Error(`rules.${ruleId} must be an object.`);
    }

    const existing = base[ruleId];
    if (!existing) {
      // Unknown rule IDs are tolerated for forward compatibility, but disabled by default.
      base[ruleId] = {
        enabled:
          typeof maybeRule.enabled === "boolean" ? maybeRule.enabled : false,
        severity:
          isSeverity(maybeRule.severity) ? maybeRule.severity : "minor",
      };
      continue;
    }

    const enabled =
      typeof maybeRule.enabled === "boolean" ? maybeRule.enabled : existing.enabled;
    const severity =
      maybeRule.severity === undefined
        ? existing.severity
        : parseSeverity(maybeRule.severity, `rules.${ruleId}.severity`);

    base[ruleId] = { enabled, severity };
  }

  return base;
}

function normalizeSuppressions(value: unknown): Suppression[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("suppressions must be an array.");
  }

  return value.map((item, index) => {
    if (!isObject(item)) {
      throw new Error(`suppressions[${index}] must be an object.`);
    }

    const ruleId = toStringField(item.ruleId, `suppressions[${index}].ruleId`);
    const targetId = toStringField(item.targetId, `suppressions[${index}].targetId`);
    const reason = toStringField(item.reason, `suppressions[${index}].reason`);
    const expiresOn = toStringField(item.expiresOn, `suppressions[${index}].expiresOn`);

    const owner = item.owner === undefined ? undefined : toStringField(item.owner, `suppressions[${index}].owner`);

    return { ruleId, targetId, reason, expiresOn, owner };
  });
}

function normalizeSeverityList(
  value: unknown,
  label: string,
  fallback: Severity[],
): Severity[] {
  if (value === undefined) {
    return [...fallback];
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array of severities.`);
  }

  return value.map((entry, idx) => parseSeverity(entry, `${label}[${idx}]`));
}

function normalizeReportFormats(
  value: unknown,
  fallback: Array<"json" | "html">,
): Array<"json" | "html"> {
  if (value === undefined) {
    return [...fallback];
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("report.formats must be a non-empty array.");
  }

  const formats = value.map((entry, idx) => {
    if (entry !== "json" && entry !== "html") {
      throw new Error(`report.formats[${idx}] must be \"json\" or \"html\".`);
    }
    return entry;
  });

  return Array.from(new Set(formats));
}

function parseSeverity(value: unknown, label: string): Severity {
  if (!isSeverity(value)) {
    throw new Error(`${label} must be one of: ${VALID_SEVERITIES.join(", ")}.`);
  }
  return value;
}

function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && VALID_SEVERITIES.includes(value as Severity);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringField(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}
