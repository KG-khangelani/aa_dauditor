import test from "node:test";
import assert from "node:assert/strict";
import type { NormalizedTarget } from "../src/core/types.js";
import { resolveEffectiveBackground } from "../src/normalize/query.js";

function baseTarget(nodes: NormalizedTarget["nodes"]): NormalizedTarget {
  return {
    figmaUrl: "https://www.figma.com/file/demo?node-id=1-1",
    nodeId: "1:1",
    frameName: "Demo",
    nodes,
    warnings: [],
  };
}

test("resolves background from covering opaque ancestor when intermediate is transparent", () => {
  const target = baseTarget([
    {
      id: "1:1",
      name: "Root",
      type: "FRAME",
      bounds: { x: 0, y: 0, width: 300, height: 200 },
      fills: [{ r: 255, g: 255, b: 255, a: 1 }],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:2",
      parentId: "1:1",
      name: "Transparent wrapper",
      type: "FRAME",
      bounds: { x: 0, y: 0, width: 300, height: 200 },
      fills: [{ r: 10, g: 10, b: 10, a: 0 }],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:3",
      parentId: "1:2",
      name: "Label",
      type: "TEXT",
      bounds: { x: 10, y: 10, width: 100, height: 20 },
      fills: [{ r: 120, g: 120, b: 120, a: 1 }],
      strokes: [],
      text: "Label",
      isInteractive: false,
    },
  ]);

  const node = target.nodes.find((n) => n.id === "1:3")!;
  const resolution = resolveEffectiveBackground(target, node);

  assert.ok(resolution.color);
  assert.equal(resolution.color?.r, 255);
  assert.match(resolution.sourceLayerPath ?? "", /Root/);
});

test("marks background unresolved when only non-covering ancestor has color", () => {
  const target = baseTarget([
    {
      id: "1:1",
      name: "Root",
      type: "FRAME",
      bounds: { x: 0, y: 0, width: 120, height: 120 },
      fills: [],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:2",
      parentId: "1:1",
      name: "Card",
      type: "FRAME",
      bounds: { x: 0, y: 0, width: 40, height: 40 },
      fills: [{ r: 240, g: 240, b: 240, a: 1 }],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:3",
      parentId: "1:2",
      name: "Label",
      type: "TEXT",
      bounds: { x: 60, y: 60, width: 40, height: 20 },
      fills: [{ r: 30, g: 30, b: 30, a: 1 }],
      strokes: [],
      text: "Hello",
      isInteractive: false,
    },
  ]);

  const node = target.nodes.find((n) => n.id === "1:3")!;
  const resolution = resolveEffectiveBackground(target, node);

  assert.equal(resolution.color, undefined);
  assert.match(resolution.reason ?? "", /do not fully cover/);
});
