import type { Finding, Suppression } from "../core/types.js";

export interface SuppressionResult {
  findings: Finding[];
  warnings: string[];
}

export function applySuppressions(
  findings: Finding[],
  suppressions: Suppression[],
  now: Date,
): SuppressionResult {
  const warnings: string[] = [];

  const active = suppressions.filter((suppression, idx) => {
    if (!suppression.reason.trim()) {
      warnings.push(`Suppression[${idx}] ignored because reason is empty.`);
      return false;
    }

    const expiry = new Date(suppression.expiresOn);
    if (Number.isNaN(expiry.getTime())) {
      warnings.push(
        `Suppression ${suppression.ruleId}/${suppression.targetId} ignored due to invalid expiresOn date.`,
      );
      return false;
    }

    if (expiry.getTime() < now.getTime()) {
      warnings.push(
        `Suppression ${suppression.ruleId}/${suppression.targetId} expired on ${suppression.expiresOn}.`,
      );
      return false;
    }

    return true;
  });

  const updatedFindings = findings.map((finding) => {
    const match = active.find(
      (suppression) =>
        suppression.ruleId === finding.ruleId &&
        (suppression.targetId === "*" || suppression.targetId === finding.targetRef.nodeId),
    );

    if (!match) {
      return finding;
    }

    return {
      ...finding,
      suppressed: {
        ...match,
        matchedAt: now.toISOString(),
      },
    };
  });

  return {
    findings: updatedFindings,
    warnings,
  };
}
