import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTarget } from "../src/normalize/model.js";

test("normalizeTarget merges expanded contexts to enrich truncated metadata nodes", () => {
  const target = normalizeTarget({
    figmaUrl: "https://www.figma.com/file/demo?node-id=1-1",
    nodeId: "1:1",
    frameName: "Root",
    warnings: [],
    designContext:
      '<frame id="1:1" name="Root" x="0" y="0" width="320" height="200"><text id="1:2" name="Title" x="8" y="8" width="120" height="24" /></frame>',
    expandedDesignContexts: [
      {
        nodeId: "1:2",
        context: {
          node: {
            id: "1:2",
            type: "TEXT",
            name: "Title",
            characters: "Hello",
            style: {
              fontSize: 16,
              fontWeight: 400,
            },
            fills: [
              {
                type: "SOLID",
                color: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
              },
            ],
            absoluteBoundingBox: { x: 8, y: 8, width: 120, height: 24 },
          },
        },
      },
    ],
  });

  const textNode = target.nodes.find((node) => node.id === "1:2");
  assert.ok(textNode);
  assert.equal(textNode?.parentId, "1:1");
  assert.equal(textNode?.fills.length, 1);
  assert.equal(textNode?.text, "Hello");
});
