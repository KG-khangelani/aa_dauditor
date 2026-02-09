import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { AuditReport, Finding, TargetResult } from "../core/types.js";

export async function writeHtmlReport(
  outDir: string,
  report: AuditReport,
): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const outputPath = join(outDir, "audit-report.html");

  const html = renderHtml(outDir, report);
  await writeFile(outputPath, html, "utf8");
  return outputPath;
}

function renderHtml(outDir: string, report: AuditReport): string {
  const severityRows = Object.entries(report.summary.bySeverity)
    .map(([severity, count]) => `<tr><td>${escapeHtml(severity)}</td><td>${count}</td></tr>`)
    .join("\n");

  const targetSections = report.targets.map((target) => renderTarget(outDir, target)).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AA Auditor Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #1f2937; }
    h1, h2, h3 { margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .blocker { background: #fee2e2; color: #991b1b; }
    .critical { background: #ffedd5; color: #9a3412; }
    .major { background: #fef9c3; color: #854d0e; }
    .minor { background: #e0f2fe; color: #0c4a6e; }
    .manual { background: #ede9fe; color: #5b21b6; }
    .suppressed { background: #dcfce7; color: #166534; }
    img { max-width: 540px; border: 1px solid #e5e7eb; border-radius: 6px; }
    .muted { color: #6b7280; }
    .section { margin-bottom: 28px; }
  </style>
</head>
<body>
  <h1>AA WCAG 2.2 Report</h1>
  <p class="muted">Run ID: ${escapeHtml(report.runId)} | Started: ${escapeHtml(report.startedAt)} | Finished: ${escapeHtml(report.finishedAt)}</p>

  <div class="section">
    <h2>Summary</h2>
    <table>
      <tr><th>Total targets</th><td>${report.summary.totalTargets}</td></tr>
      <tr><th>Total findings</th><td>${report.summary.totalFindings}</td></tr>
      <tr><th>Suppressed findings</th><td>${report.summary.suppressedFindings}</td></tr>
      <tr><th>Manual-review findings</th><td>${report.summary.manualReviewFindings}</td></tr>
      <tr><th>Failed targets</th><td>${report.summary.failedTargets}</td></tr>
    </table>
    <h3>Findings by Severity</h3>
    <table>
      <thead><tr><th>Severity</th><th>Count</th></tr></thead>
      <tbody>${severityRows}</tbody>
    </table>
  </div>

  ${targetSections}
</body>
</html>`;
}

function renderTarget(outDir: string, target: TargetResult): string {
  const screenshot = target.screenshotPath
    ? renderScreenshot(outDir, target.screenshotPath)
    : '<p class="muted">No screenshot available.</p>';

  const findingRows = target.findings.length
    ? target.findings.map(renderFindingRow).join("\n")
    : '<tr><td colspan="7" class="muted">No findings.</td></tr>';

  const manualRows = target.manualChecks.length
    ? target.manualChecks
        .map(
          (check) =>
            `<tr><td>${escapeHtml(check.wcagCriterion)}</td><td>${escapeHtml(
              check.targetRef.layerPath ?? check.targetRef.frameName,
            )}</td><td>${escapeHtml(
              check.prompt,
            )}</td></tr>`,
        )
        .join("\n")
    : '<tr><td colspan="3" class="muted">No manual checks.</td></tr>';

  const warnings = target.warnings.length
    ? `<ul>${target.warnings
        .map((warning) => `<li>${escapeHtml(warning)}</li>`)
        .join("")}</ul>`
    : '<p class="muted">No target warnings.</p>';

  return `<div class="section">
    <h2>${escapeHtml(target.frameName)}</h2>
    <p><strong>Node ID:</strong> ${escapeHtml(target.nodeId)}<br/><strong>URL:</strong> <a href="${escapeHtml(
      target.figmaUrl,
    )}" target="_blank">${escapeHtml(target.figmaUrl)}</a></p>
    ${screenshot}
    <h3>Findings</h3>
    <table>
      <thead><tr><th>Severity</th><th>Status</th><th>Rule</th><th>Criterion</th><th>Layer Path</th><th>Message</th><th>Evidence</th></tr></thead>
      <tbody>${findingRows}</tbody>
    </table>
    <h3>Manual Checklist</h3>
    <table>
      <thead><tr><th>Criterion</th><th>Layer Path</th><th>Prompt</th></tr></thead>
      <tbody>${manualRows}</tbody>
    </table>
    <h3>Warnings</h3>
    ${warnings}
  </div>`;
}

function renderScreenshot(outDir: string, screenshotPath: string): string {
  if (/^https?:\/\//i.test(screenshotPath)) {
    return `<p><img src="${escapeHtml(screenshotPath)}" alt="Figma screenshot" /></p>`;
  }

  const rel = relative(outDir, screenshotPath).split("\\").join("/");
  return `<p><img src="${escapeHtml(rel)}" alt="Figma screenshot" /></p>`;
}

function renderFindingRow(finding: Finding): string {
  const severityClass = escapeHtml(finding.severity);
  const statusClass =
    finding.status === "needs-manual-review" ? "manual" : severityClass;
  const suppressed = finding.suppressed
    ? `<span class="badge suppressed">suppressed until ${escapeHtml(
        finding.suppressed.expiresOn,
      )}</span>`
    : "";

  return `<tr>
    <td><span class="badge ${severityClass}">${escapeHtml(finding.severity)}</span></td>
    <td><span class="badge ${statusClass}">${escapeHtml(finding.status)}</span> ${suppressed}</td>
    <td>${escapeHtml(finding.ruleId)}</td>
    <td>${escapeHtml(finding.wcagCriterion)}</td>
    <td>${escapeHtml(finding.targetRef.layerPath ?? finding.targetRef.frameName)}</td>
    <td>${escapeHtml(finding.message)}</td>
    <td>${escapeHtml(finding.evidence ?? "-")}</td>
  </tr>`;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
