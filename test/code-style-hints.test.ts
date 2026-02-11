import test from "node:test";
import assert from "node:assert/strict";
import {
  extractDocumentBackgroundHintFromCode,
  extractNodeStyleHintsFromCode,
} from "../src/figma/code-style-hints.js";

test("extractNodeStyleHintsFromCode maps node-id class colors to fills/strokes", () => {
  const code = `
    <div className="bg-[color:var(--surface,#F5F5F5)] border-[color:var(--border,#D9D9D9)]" data-node-id="10:1"></div>
    <p className="text-[color:var(--text,#102b7c)]" data-node-id="10:2">Label</p>
    <span className="text-[#FF0000]" data-node-id="10:3">Hot</span>
  `;

  const hints = extractNodeStyleHintsFromCode(code);

  assert.ok(hints["10:1"]);
  assert.equal(hints["10:1"].fills[0].r, 245);
  assert.equal(hints["10:1"].strokes[0].r, 217);

  assert.ok(hints["10:2"]);
  assert.equal(hints["10:2"].textFills[0].b, 124);

  assert.ok(hints["10:3"]);
  assert.equal(hints["10:3"].textFills[0].r, 255);
});

test("extractNodeStyleHintsFromCode resolves css var colors from design system map", () => {
  const code = `
    <p className="text-[color:var(--primary\\/forcelink\\/primary-7)]" data-node-id="11:1">Title</p>
  `;

  const hints = extractNodeStyleHintsFromCode(code, {
    "Primary/Forcelink/primary-7": "#102B7C",
  });

  assert.ok(hints["11:1"]);
  assert.equal(hints["11:1"].textFills[0].r, 16);
  assert.equal(hints["11:1"].textFills[0].g, 43);
  assert.equal(hints["11:1"].textFills[0].b, 124);
});

test("extractNodeStyleHintsFromCode supports class attribute and single quotes", () => {
  const code = `
    <div class='bg-[#FAFAFA]' data-node-id="12:1"></div>
    <span class='text-[color:var(--neutral\\/900,#111111)]' data-node-id="12:2">Hi</span>
  `;

  const hints = extractNodeStyleHintsFromCode(code);

  assert.ok(hints["12:1"]);
  assert.equal(hints["12:1"].fills[0].r, 250);
  assert.equal(hints["12:1"].fills[0].g, 250);
  assert.equal(hints["12:1"].fills[0].b, 250);

  assert.ok(hints["12:2"]);
  assert.equal(hints["12:2"].textFills[0].r, 17);
  assert.equal(hints["12:2"].textFills[0].g, 17);
  assert.equal(hints["12:2"].textFills[0].b, 17);
});

test("extractDocumentBackgroundHintFromCode picks first solid bg token", () => {
  const code = `
    <div className="relative bg-[color:var(--surface,#F8F9FA)]">
      <div class="text-[#262626]" data-node-id="1:2">Title</div>
    </div>
  `;

  const bg = extractDocumentBackgroundHintFromCode(code);
  assert.ok(bg);
  assert.equal(bg?.r, 248);
  assert.equal(bg?.g, 249);
  assert.equal(bg?.b, 250);
  assert.equal(bg?.a, 1);
});
