import test from "node:test";
import assert from "node:assert/strict";
import { applySuppressions } from "../src/suppressions/apply.js";
import type { Finding } from "../src/core/types.js";

const finding: Finding = {
  id: "f1",
  ruleId: "WCAG-1.4.3-text-contrast-minimum",
  wcagCriterion: "1.4.3",
  severity: "critical",
  status: "failed",
  message: "Low contrast",
  targetRef: {
    figmaUrl: "https://www.figma.com/file/demo?node-id=1-2",
    nodeId: "2:1",
    frameName: "Checkout",
  },
};

test("active suppression marks finding as suppressed", () => {
  const result = applySuppressions(
    [finding],
    [
      {
        ruleId: "WCAG-1.4.3-text-contrast-minimum",
        targetId: "2:1",
        reason: "Legacy component pending replacement",
        expiresOn: "2027-01-01",
        owner: "design-systems",
      },
    ],
    new Date("2026-02-09T00:00:00.000Z"),
  );

  assert.equal(result.findings[0].suppressed?.owner, "design-systems");
  assert.equal(result.warnings.length, 0);
});

test("expired suppression is ignored with warning", () => {
  const result = applySuppressions(
    [finding],
    [
      {
        ruleId: "WCAG-1.4.3-text-contrast-minimum",
        targetId: "2:1",
        reason: "Expired",
        expiresOn: "2025-01-01",
      },
    ],
    new Date("2026-02-09T00:00:00.000Z"),
  );

  assert.equal(result.findings[0].suppressed, undefined);
  assert.equal(result.warnings.length, 1);
});
