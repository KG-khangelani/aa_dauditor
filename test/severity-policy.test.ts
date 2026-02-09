import test from "node:test";
import assert from "node:assert/strict";
import { shouldFailBuild } from "../src/severity/policy.js";
import type { Finding } from "../src/core/types.js";

const baseFinding: Finding = {
  id: "f1",
  ruleId: "WCAG-2.5.8-target-size-minimum",
  wcagCriterion: "2.5.8",
  severity: "blocker",
  status: "failed",
  message: "Too small",
  targetRef: {
    figmaUrl: "https://www.figma.com/file/demo?node-id=1-2",
    nodeId: "2:2",
    frameName: "Checkout",
  },
};

test("build fails when unsuppressed finding matches failOn", () => {
  assert.equal(shouldFailBuild([baseFinding], ["blocker", "critical"]), true);
});

test("build does not fail when only suppressed finding matches failOn", () => {
  assert.equal(
    shouldFailBuild(
      [
        {
          ...baseFinding,
          suppressed: {
            ruleId: baseFinding.ruleId,
            targetId: baseFinding.targetRef.nodeId,
            reason: "waived",
            expiresOn: "2026-12-01",
            matchedAt: "2026-02-09T00:00:00.000Z",
          },
        },
      ],
      ["blocker", "critical"],
    ),
    false,
  );
});
