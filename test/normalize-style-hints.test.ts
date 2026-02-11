import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTarget } from "../src/normalize/model.js";

test("normalizeTarget applies node style hints when metadata lacks fills", () => {
  const target = normalizeTarget({
    figmaUrl: "https://www.figma.com/file/demo?node-id=1-1",
    nodeId: "1:1",
    frameName: "Demo",
    designContext:
      '<frame id="1:1" name="Root" x="0" y="0" width="100" height="100"><text id="1:2" name="Title" x="10" y="10" width="50" height="20"/></frame>',
    nodeStyleHints: {
      "1:2": {
        fills: [],
        textFills: [{ r: 16, g: 43, b: 124, a: 1 }],
        strokes: [],
      },
    },
    warnings: [],
  });

  const title = target.nodes.find((node) => node.id === "1:2");
  assert.ok(title);
  assert.equal(title?.fills.length, 1);
  assert.equal(title?.fills[0].b, 124);
});

test("normalizeTarget carries fallback background color from payload", () => {
  const target = normalizeTarget({
    figmaUrl: "https://www.figma.com/file/demo?node-id=1-1",
    nodeId: "1:1",
    frameName: "Demo",
    designContext:
      '<frame id="1:1" name="Root" x="0" y="0" width="100" height="100"><text id="1:2" name="Title" x="10" y="10" width="50" height="20"/></frame>',
    fallbackBackgroundColor: { r: 248, g: 249, b: 250, a: 1 },
    warnings: [],
  });

  assert.deepEqual(target.fallbackBackgroundColor, {
    r: 248,
    g: 249,
    b: 250,
    a: 1,
  });
});
