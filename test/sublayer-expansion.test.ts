import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMetadataXmlNodes,
  selectSublayerCandidatesFromMetadata,
} from "../src/figma/sublayer-expansion.js";

const metadataXml = `<frame id="1:1" name="Root" x="0" y="0" width="1000" height="1000">
  <frame id="1:2" name="Controls" x="0" y="0" width="300" height="100">
    <text id="1:3" name="Title" x="10" y="10" width="120" height="24" />
  </frame>
  <frame id="1:4" name="Hidden Group" x="0" y="0" width="200" height="100" hidden="true">
    <text id="1:5" name="Hidden Label" x="10" y="10" width="90" height="18" />
  </frame>
  <frame id="1:6" name="Transparent Group" x="0" y="0" width="200" height="100" opacity="0">
    <text id="1:7" name="Transparent Label" x="10" y="10" width="90" height="18" />
  </frame>
  <instance id="1:8" name="Search Input" x="20" y="140" width="320" height="40" />
</frame>`;

test("parseMetadataXmlNodes captures hierarchy and visibility", () => {
  const nodes = parseMetadataXmlNodes(metadataXml);
  const root = nodes.find((n) => n.id === "1:1");
  const child = nodes.find((n) => n.id === "1:3");
  const hidden = nodes.find((n) => n.id === "1:5");

  assert.ok(root);
  assert.ok(child);
  assert.equal(child?.parentId, "1:2");
  assert.equal(hidden?.hidden, true);
});

test("selectSublayerCandidatesFromMetadata filters hidden/zero-opacity and ranks useful children", () => {
  const selected = selectSublayerCandidatesFromMetadata(metadataXml, "1:1", 5);

  assert.ok(selected.includes("1:8"));
  assert.ok(selected.includes("1:2"));
  assert.ok(!selected.includes("1:4"));
  assert.ok(!selected.includes("1:5"));
  assert.ok(!selected.includes("1:6"));
  assert.ok(!selected.includes("1:7"));
});
