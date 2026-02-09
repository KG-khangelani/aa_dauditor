import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTarget } from "../src/normalize/model.js";
import { targetSizeRule } from "../src/rules/rule-target-size.js";

test("hidden and zero-opacity layers are ignored by audit checks", () => {
  const target = normalizeTarget({
    figmaUrl: "https://www.figma.com/file/demo?node-id=1-1",
    nodeId: "1:1",
    frameName: "Visibility frame",
    warnings: [],
    designContext: {
      document: {
        id: "1:1",
        type: "FRAME",
        name: "Visibility frame",
        absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 200 },
        children: [
          {
            id: "1:2",
            type: "RECTANGLE",
            name: "Visible tiny button",
            reactions: [{ action: "NAVIGATE" }],
            absoluteBoundingBox: { x: 10, y: 10, width: 10, height: 10 },
          },
          {
            id: "1:3",
            type: "RECTANGLE",
            name: "Hidden tiny button",
            visible: false,
            reactions: [{ action: "NAVIGATE" }],
            absoluteBoundingBox: { x: 30, y: 10, width: 10, height: 10 },
          },
          {
            id: "1:4",
            type: "RECTANGLE",
            name: "Zero opacity tiny button",
            opacity: 0,
            reactions: [{ action: "NAVIGATE" }],
            absoluteBoundingBox: { x: 50, y: 10, width: 10, height: 10 },
          },
        ],
      },
    },
  });

  const findings = targetSizeRule.evaluate({
    target,
    reportStartIso: "2026-02-09T00:00:00.000Z",
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].targetRef.nodeId, "1:2");
});
