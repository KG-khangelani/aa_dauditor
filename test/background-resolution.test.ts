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

test("resolves background from sibling underlay through transparent parent frame", () => {
  const target = baseTarget([
    {
      id: "1:1",
      name: "Root",
      type: "FRAME",
      bounds: { x: 0, y: 0, width: 400, height: 300 },
      fills: [{ r: 255, g: 255, b: 255, a: 1 }],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:2",
      parentId: "1:1",
      name: "Card",
      type: "FRAME",
      bounds: { x: 20, y: 20, width: 300, height: 180 },
      fills: [],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:3",
      parentId: "1:2",
      name: "Card Background",
      type: "RECTANGLE",
      bounds: { x: 20, y: 20, width: 300, height: 180 },
      fills: [{ r: 245, g: 245, b: 245, a: 1 }],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:4",
      parentId: "1:2",
      name: "Content Wrapper",
      type: "FRAME",
      bounds: { x: 40, y: 40, width: 260, height: 120 },
      fills: [{ r: 10, g: 10, b: 10, a: 0 }],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:5",
      parentId: "1:4",
      name: "Heading",
      type: "TEXT",
      bounds: { x: 60, y: 60, width: 120, height: 24 },
      fills: [{ r: 40, g: 40, b: 40, a: 1 }],
      strokes: [],
      text: "Title",
      isInteractive: false,
    },
  ]);

  const node = target.nodes.find((n) => n.id === "1:5")!;
  const resolution = resolveEffectiveBackground(target, node);

  assert.ok(resolution.color);
  assert.equal(resolution.color?.r, 245);
  assert.match(resolution.sourceLayerPath ?? "", /Card Background/);
});

test("ignores sibling layers that are above the current transparent wrapper", () => {
  const target = baseTarget([
    {
      id: "1:1",
      name: "Root",
      type: "FRAME",
      bounds: { x: 0, y: 0, width: 400, height: 300 },
      fills: [{ r: 255, g: 255, b: 255, a: 1 }],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:2",
      parentId: "1:1",
      name: "Card",
      type: "FRAME",
      bounds: { x: 20, y: 20, width: 300, height: 180 },
      fills: [],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:3",
      parentId: "1:2",
      name: "Content Wrapper",
      type: "FRAME",
      bounds: { x: 40, y: 40, width: 260, height: 120 },
      fills: [{ r: 10, g: 10, b: 10, a: 0 }],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:4",
      parentId: "1:3",
      name: "Heading",
      type: "TEXT",
      bounds: { x: 60, y: 60, width: 120, height: 24 },
      fills: [{ r: 40, g: 40, b: 40, a: 1 }],
      strokes: [],
      text: "Title",
      isInteractive: false,
    },
    {
      id: "1:5",
      parentId: "1:2",
      name: "Top Overlay",
      type: "RECTANGLE",
      bounds: { x: 20, y: 20, width: 300, height: 180 },
      fills: [{ r: 200, g: 10, b: 10, a: 1 }],
      strokes: [],
      isInteractive: false,
    },
  ]);

  const node = target.nodes.find((n) => n.id === "1:4")!;
  const resolution = resolveEffectiveBackground(target, node);

  assert.ok(resolution.color);
  assert.equal(resolution.color?.r, 255);
  assert.doesNotMatch(resolution.sourceLayerPath ?? "", /Top Overlay/);
});

test("resolves outer background in metadata fallback when nested bounds are local", () => {
  const target = baseTarget([
    {
      id: "1:1",
      name: "Root",
      type: "FRAME",
      bounds: { x: 0, y: 0, width: 1200, height: 800 },
      fills: [{ r: 255, g: 255, b: 255, a: 1 }],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:2",
      parentId: "1:1",
      name: "Work Map - Individual Selection - 11",
      type: "FRAME",
      bounds: { x: 300, y: 120, width: 600, height: 500 },
      fills: [{ r: 247, g: 248, b: 250, a: 1 }],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:3",
      parentId: "1:2",
      name: "Frame 4006",
      type: "FRAME",
      bounds: { x: 24, y: 24, width: 540, height: 420 },
      fills: [{ r: 0, g: 0, b: 0, a: 0 }],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:4",
      parentId: "1:3",
      name: "Label",
      type: "TEXT",
      // Simulates metadata-style nested-local coordinates.
      bounds: { x: 16, y: 12, width: 120, height: 24 },
      fills: [{ r: 80, g: 80, b: 80, a: 1 }],
      strokes: [],
      text: "Example",
      isInteractive: false,
    },
  ]);
  target.contextSource = "metadata-fallback";

  const node = target.nodes.find((n) => n.id === "1:4")!;
  const resolution = resolveEffectiveBackground(target, node);

  assert.ok(resolution.color);
  assert.equal(resolution.color?.r, 247);
  assert.match(
    resolution.sourceLayerPath ?? "",
    /Work Map - Individual Selection - 11/,
  );
});

test("does not use sibling text layers as effective background under transparent wrappers", () => {
  const target = baseTarget([
    {
      id: "1:1",
      name: "Root",
      type: "FRAME",
      bounds: { x: 0, y: 0, width: 400, height: 240 },
      fills: [{ r: 255, g: 255, b: 255, a: 1 }],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:2",
      parentId: "1:1",
      name: "Panel",
      type: "FRAME",
      bounds: { x: 20, y: 20, width: 360, height: 180 },
      fills: [],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:3",
      parentId: "1:2",
      name: "Underlay Text",
      type: "TEXT",
      bounds: { x: 24, y: 24, width: 150, height: 20 },
      fills: [{ r: 38, g: 38, b: 38, a: 1 }],
      strokes: [],
      text: "Status",
      isInteractive: false,
    },
    {
      id: "1:4",
      parentId: "1:2",
      name: "Transparent Wrapper",
      type: "FRAME",
      bounds: { x: 20, y: 20, width: 320, height: 120 },
      fills: [{ r: 0, g: 0, b: 0, a: 0 }],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:5",
      parentId: "1:4",
      name: "Foreground Label",
      type: "TEXT",
      bounds: { x: 40, y: 40, width: 120, height: 24 },
      fills: [{ r: 38, g: 38, b: 38, a: 1 }],
      strokes: [],
      text: "Angel Jili",
      isInteractive: false,
    },
  ]);

  const node = target.nodes.find((n) => n.id === "1:5")!;
  const resolution = resolveEffectiveBackground(target, node);

  assert.ok(resolution.color);
  assert.equal(resolution.color?.r, 255);
  assert.doesNotMatch(resolution.sourceLayerPath ?? "", /Underlay Text/);
});

test("uses document background fallback when hierarchy has no fill colors", () => {
  const target = baseTarget([
    {
      id: "1:1",
      name: "Root",
      type: "FRAME",
      bounds: { x: 0, y: 0, width: 400, height: 300 },
      fills: [],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:2",
      parentId: "1:1",
      name: "Header",
      type: "FRAME",
      bounds: { x: 20, y: 20, width: 360, height: 40 },
      fills: [],
      strokes: [],
      isInteractive: false,
    },
    {
      id: "1:3",
      parentId: "1:2",
      name: "Resource Page",
      type: "TEXT",
      bounds: { x: 0, y: 10, width: 100, height: 20 },
      fills: [{ r: 16, g: 43, b: 124, a: 1 }],
      strokes: [],
      text: "Resource Page",
      isInteractive: false,
    },
  ]);
  target.fallbackBackgroundColor = { r: 248, g: 249, b: 250, a: 1 };

  const node = target.nodes.find((n) => n.id === "1:3")!;
  const resolution = resolveEffectiveBackground(target, node);

  assert.ok(resolution.color);
  assert.equal(resolution.color?.r, 248);
  assert.match(resolution.sourceLayerPath ?? "", /design-context-fallback/);
});
