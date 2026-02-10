import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseMcpHealthError } from "../src/figma/mcpClient.js";

test("diagnoseMcpHealthError classifies unsupported file context", () => {
  const diagnosis = diagnoseMcpHealthError(
    "The MCP server tools are only available for design, FigJam, and Make files.",
  );

  assert.equal(diagnosis.status, "fail");
  assert.match(diagnosis.summary, /unsupported file context/i);
});

test("diagnoseMcpHealthError classifies auth failures", () => {
  const diagnosis = diagnoseMcpHealthError("HTTP 401 from MCP endpoint: Unauthorized");

  assert.equal(diagnosis.status, "fail");
  assert.match(diagnosis.summary, /authentication failed/i);
  assert.ok(diagnosis.suggestions.length > 0);
});

test("diagnoseMcpHealthError classifies timeout/abort failures", () => {
  const diagnosis = diagnoseMcpHealthError("This operation was aborted");

  assert.equal(diagnosis.status, "fail");
  assert.match(diagnosis.summary, /timed out|aborted/i);
});

test("diagnoseMcpHealthError classifies local codegen bridge failures", () => {
  const diagnosis = diagnoseMcpHealthError(
    "Cannot read properties of undefined (reading 'enableCodegenMcpServer')",
  );

  assert.equal(diagnosis.status, "fail");
  assert.match(diagnosis.summary, /broken codegen state/i);
});
