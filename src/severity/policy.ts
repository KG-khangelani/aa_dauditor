import type { Finding, Severity } from "../core/types.js";

export function shouldFailBuild(findings: Finding[], failOn: Severity[]): boolean {
  const gate = new Set(failOn);

  return findings.some(
    (finding) =>
      finding.status === "failed" &&
      !finding.suppressed &&
      gate.has(finding.severity),
  );
}

export function severitySortValue(severity: Severity): number {
  switch (severity) {
    case "blocker":
      return 0;
    case "critical":
      return 1;
    case "major":
      return 2;
    case "minor":
      return 3;
  }
}
