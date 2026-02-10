import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseFigmaUrl } from "../figma/url.js";
import { buildManualChecklist } from "../manual/checklist.js";
import { normalizeTarget } from "../normalize/model.js";
import { writeHtmlReport } from "../report/html.js";
import { writeJsonReport } from "../report/json.js";
import { executeRules, RULES } from "../rules/index.js";
import { shouldFailBuild, severitySortValue } from "../severity/policy.js";
import { applySuppressions } from "../suppressions/apply.js";
import type {
  AuditReport,
  AuditRunDeps,
  AuditRunOptions,
  Finding,
  ManualCheck,
  Severity,
  TargetResult,
  NormalizedTarget,
} from "./types.js";
import { persistScreenshot } from "../figma/mcpClient.js";

export interface AuditRunResult {
  report: AuditReport;
  shouldFail: boolean;
  jsonPath?: string;
  htmlPath?: string;
}

export async function runAudit(
  options: AuditRunOptions,
  deps: AuditRunDeps,
): Promise<AuditRunResult> {
  const startedAt = deps.now().toISOString();
  await mkdir(options.outDir, { recursive: true });

  const targetResults: TargetResult[] = [];
  const globalWarnings: string[] = [];

  for (const target of options.targets) {
    try {
      const payload = await deps.figmaClient.fetchTarget(target.figmaUrl);
      const normalized = normalizeTarget(payload);
      const designSystemColors = {
        ...(payload.designSystemColors ?? {}),
        ...options.config.designSystemColors,
      };

      let screenshotPath: string | undefined;
      if (options.config.report.includeScreenshots) {
        screenshotPath = await persistScreenshot(
          payload,
          join(options.outDir, "assets"),
        );
      }

      const enabledRules = RULES.filter((rule) => {
        const config = options.config.rules[rule.id];
        return config ? config.enabled : true;
      });

      const rawFindings = executeRules(
        {
          target: normalized,
          reportStartIso: startedAt,
          designSystemColors,
        },
        enabledRules,
      );

      const severityAdjusted = rawFindings.map((finding) => {
        const cfg = options.config.rules[finding.ruleId];
        if (!cfg) {
          return finding;
        }

        return {
          ...finding,
          severity: cfg.severity,
        };
      });

      const suppressionResult = applySuppressions(
        severityAdjusted,
        options.config.suppressions,
        deps.now(),
      );

      const manualChecks = buildManualChecklist(normalized);

      targetResults.push({
        figmaUrl: target.figmaUrl,
        nodeId: normalized.nodeId,
        frameName: normalized.frameName,
        screenshotPath,
        findings: sortFindings(suppressionResult.findings),
        manualChecks,
        warnings: [...normalized.warnings, ...suppressionResult.warnings],
      });
    } catch (error) {
      targetResults.push(
        buildFetchFailureTargetResult(target.figmaUrl, (error as Error).message),
      );
    }
  }

  const findings = targetResults.flatMap((target) => target.findings);
  const manualChecks = targetResults.flatMap((target) => target.manualChecks);

  const bySeverity = countBySeverity(findings);

  const report: AuditReport = {
    runId: deps.runIdFactory(),
    startedAt,
    finishedAt: deps.now().toISOString(),
    wcagVersion: options.config.wcagVersion,
    level: options.config.level,
    summary: {
      totalTargets: options.targets.length,
      totalFindings: findings.length,
      suppressedFindings: findings.filter((finding) => Boolean(finding.suppressed)).length,
      manualReviewFindings: findings.filter(
        (finding) => finding.status === "needs-manual-review",
      ).length,
      bySeverity,
      failedTargets: targetResults.filter((target) =>
        target.findings.some(
          (finding) => finding.status === "failed" && !finding.suppressed,
        ),
      ).length,
      warnings: [
        ...globalWarnings,
        ...targetResults.flatMap((target) =>
          target.warnings.map((warning) => `${target.frameName}: ${warning}`),
        ),
      ],
    },
    targets: sortTargets(targetResults),
    findings: sortFindings(findings),
    manualChecks: sortManualChecks(manualChecks),
  };

  let jsonPath: string | undefined;
  let htmlPath: string | undefined;

  if (options.reportFormat === "json" || options.reportFormat === "both") {
    jsonPath = await writeJsonReport(options.outDir, report);
  }

  if (options.reportFormat === "html" || options.reportFormat === "both") {
    htmlPath = await writeHtmlReport(options.outDir, report);
  }

  return {
    report,
    shouldFail: shouldFailBuild(report.findings, options.failOn),
    jsonPath,
    htmlPath,
  };
}

function countBySeverity(findings: Finding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>(
    (acc, finding) => {
      if (finding.suppressed) {
        return acc;
      }
      if (finding.status !== "failed") {
        return acc;
      }
      acc[finding.severity] += 1;
      return acc;
    },
    {
      blocker: 0,
      critical: 0,
      major: 0,
      minor: 0,
    },
  );
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const severityDiff = severitySortValue(a.severity) - severitySortValue(b.severity);
    if (severityDiff !== 0) {
      return severityDiff;
    }

    return [a.ruleId, a.targetRef.nodeId, a.id].join("|").localeCompare(
      [b.ruleId, b.targetRef.nodeId, b.id].join("|"),
    );
  });
}

function sortTargets(targets: TargetResult[]): TargetResult[] {
  return [...targets].sort((a, b) =>
    [a.figmaUrl, a.nodeId, a.frameName].join("|").localeCompare(
      [b.figmaUrl, b.nodeId, b.frameName].join("|"),
    ),
  );
}

function sortManualChecks(checks: ManualCheck[]): ManualCheck[] {
  return [...checks].sort((a, b) =>
    [a.targetRef.nodeId, a.wcagCriterion, a.id].join("|").localeCompare(
      [b.targetRef.nodeId, b.wcagCriterion, b.id].join("|"),
    ),
  );
}

function buildFetchFailureTargetResult(
  figmaUrl: string,
  errorMessage: string,
): TargetResult {
  const parsed = tryParseFigmaUrl(figmaUrl);
  const nodeId = parsed?.nodeId ?? "unknown";
  const frameName = parsed ? `Figma Node ${parsed.nodeId}` : "Figma Target";

  const fallbackTarget: NormalizedTarget = {
    figmaUrl,
    nodeId,
    frameName,
    nodes: [],
    warnings: [],
  };

  return {
    figmaUrl,
    nodeId,
    frameName,
    findings: [],
    manualChecks: buildManualChecklist(fallbackTarget),
    warnings: [
      `Fetch/audit fallback engaged: ${errorMessage}`,
    ],
  };
}

function tryParseFigmaUrl(figmaUrl: string):
  | {
      nodeId: string;
    }
  | undefined {
  try {
    return parseFigmaUrl(figmaUrl);
  } catch {
    return undefined;
  }
}
