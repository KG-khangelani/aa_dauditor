import test from "node:test";
import assert from "node:assert/strict";
import type { NormalizedTarget } from "../src/core/types.js";
import { textContrastRule } from "../src/rules/rule-contrast-text.js";

test("text contrast uses sampled background color when traversal has no solid fill", () => {
  const target: NormalizedTarget = {
    figmaUrl: "https://www.figma.com/file/demo?node-id=1-1",
    nodeId: "1:1",
    frameName: "Demo",
    warnings: [],
    contextSource: "metadata-fallback",
    nodes: [
      {
        id: "1:1",
        name: "Root",
        type: "FRAME",
        bounds: { x: 0, y: 0, width: 200, height: 80 },
        fills: [],
        strokes: [],
        isInteractive: false,
      },
      {
        id: "1:2",
        parentId: "1:1",
        name: "Shift History Header",
        type: "FRAME",
        bounds: { x: 0, y: 0, width: 200, height: 40 },
        fills: [],
        strokes: [],
        isInteractive: false,
      },
      {
        id: "1:3",
        parentId: "1:2",
        name: "Resource Page",
        type: "TEXT",
        bounds: { x: 10, y: 10, width: 100, height: 18 },
        fills: [{ r: 16, g: 43, b: 124, a: 1 }],
        strokes: [],
        text: "Resource Page",
        isInteractive: false,
      },
    ],
  };

  const findings = textContrastRule.evaluate({
    target,
    reportStartIso: "2026-02-11T00:00:00.000Z",
    sampleBackgroundColor: () => ({ r: 248, g: 249, b: 250, a: 1 }),
  });

  const nodeFinding = findings.find((entry) => entry.targetRef.nodeId === "1:3");
  assert.equal(nodeFinding, undefined);
});
