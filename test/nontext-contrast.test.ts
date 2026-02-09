import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeTarget } from "../src/normalize/model.js";
import { nonTextContrastRule } from "../src/rules/rule-nontext-contrast.js";

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "test/fixtures/design-context-violations.json"), "utf8"),
) as unknown;

test("non-text contrast rule flags low contrast interactive element", () => {
  const target = normalizeTarget({
    figmaUrl: "https://www.figma.com/file/demo?node-id=1-2",
    nodeId: "1:2",
    frameName: "Checkout Form",
    designContext: fixture,
    warnings: [],
  });

  const findings = nonTextContrastRule.evaluate({
    target,
    reportStartIso: "2026-02-09T00:00:00.000Z",
  });

  assert.ok(findings.some((finding) => finding.ruleId === nonTextContrastRule.id));
  assert.ok(findings.some((finding) => finding.status === "failed"));
});
