import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeTarget } from "../src/normalize/model.js";
import { textContrastRule } from "../src/rules/rule-contrast-text.js";

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "test/fixtures/design-context-violations.json"), "utf8"),
) as unknown;

test("text contrast findings include design-system color recommendations", () => {
  const target = normalizeTarget({
    figmaUrl: "https://www.figma.com/file/demo?node-id=1-2",
    nodeId: "1:2",
    frameName: "Checkout Form",
    designContext: fixture,
    warnings: [],
  });

  const findings = textContrastRule.evaluate({
    target,
    reportStartIso: "2026-02-09T00:00:00.000Z",
    designSystemColors: {
      "text.primary": "#111827",
      "text.secondary": "#1F2937",
      "text.inverse": "#FFFFFF",
    },
  });

  const failed = findings.find((f) => f.status === "failed");
  assert.ok(failed);
  assert.ok(failed!.recommendation);
  assert.match(failed!.recommendation!, /Suggested design-system tokens/);
});
