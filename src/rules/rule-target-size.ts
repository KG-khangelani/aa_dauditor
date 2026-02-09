import { stableId } from "../core/id.js";
import type { Finding, RuleDefinition, RuleEvaluationContext } from "../core/types.js";
import { layerPathForNode, likelyInteractiveNodes } from "../normalize/query.js";

const RULE_ID = "WCAG-2.5.8-target-size-minimum";

export const targetSizeRule: RuleDefinition = {
  id: RULE_ID,
  wcagCriterion: "2.5.8",
  title: "Target size minimum",
  description: "Interactive target size should be at least 24x24 px.",
  defaultSeverity: "blocker",
  evaluate: (ctx) => evaluateTargetSize(ctx),
};

function evaluateTargetSize(ctx: RuleEvaluationContext): Finding[] {
  const findings: Finding[] = [];

  for (const node of likelyInteractiveNodes(ctx.target)) {
    const layerPath = layerPathForNode(ctx.target, node);

    if (!node.bounds) {
      findings.push({
        id: stableId([RULE_ID, ctx.target.nodeId, node.id, "manual"]),
        ruleId: RULE_ID,
        wcagCriterion: "2.5.8",
        severity: "major",
        status: "needs-manual-review",
        message: "Could not determine interactive node bounds for target-size check.",
        evidence: `Node ${node.id} (${node.name})`,
        targetRef: {
          figmaUrl: ctx.target.figmaUrl,
          nodeId: node.id,
          frameName: ctx.target.frameName,
          layerPath,
        },
      });
      continue;
    }

    if (node.bounds.width >= 24 && node.bounds.height >= 24) {
      continue;
    }

    findings.push({
      id: stableId([
        RULE_ID,
        ctx.target.nodeId,
        node.id,
        node.bounds.width.toFixed(2),
        node.bounds.height.toFixed(2),
      ]),
      ruleId: RULE_ID,
      wcagCriterion: "2.5.8",
      severity: "blocker",
      status: "failed",
      message: `Interactive target is ${node.bounds.width.toFixed(
        1,
      )}x${node.bounds.height.toFixed(1)}px; minimum is 24x24px.`,
      evidence: `Node ${node.id} (${node.name})`,
      targetRef: {
        figmaUrl: ctx.target.figmaUrl,
        nodeId: node.id,
        frameName: ctx.target.frameName,
        layerPath,
      },
    });
  }

  return findings;
}
