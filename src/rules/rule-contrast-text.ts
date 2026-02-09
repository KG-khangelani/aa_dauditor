import { colorToString, contrastRatio, isLargeText } from "../core/color.js";
import { stableId } from "../core/id.js";
import type { Finding, RuleDefinition, RuleEvaluationContext } from "../core/types.js";
import {
  findNearestBackground,
  firstFill,
  layerPathForNode,
  likelyTextNodes,
} from "../normalize/query.js";

const RULE_ID = "WCAG-1.4.3-text-contrast-minimum";

export const textContrastRule: RuleDefinition = {
  id: RULE_ID,
  wcagCriterion: "1.4.3",
  title: "Text contrast minimum",
  description:
    "Text should meet minimum contrast ratio of 4.5:1, or 3:1 for large/bold text.",
  defaultSeverity: "critical",
  evaluate: (ctx) => evaluateTextContrast(ctx),
};

function evaluateTextContrast(ctx: RuleEvaluationContext): Finding[] {
  const findings: Finding[] = [];

  for (const node of likelyTextNodes(ctx.target)) {
    const fg = firstFill(node);
    const bg = findNearestBackground(ctx.target, node);
    const layerPath = layerPathForNode(ctx.target, node);

    if (!fg || !bg) {
      findings.push({
        id: stableId([RULE_ID, ctx.target.nodeId, node.id, "manual"]),
        ruleId: RULE_ID,
        wcagCriterion: "1.4.3",
        severity: "major",
        status: "needs-manual-review",
        message:
          "Could not reliably determine text/background colors for contrast calculation.",
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

    const ratio = contrastRatio(fg, bg);
    const threshold = isLargeText(node.fontSize, node.fontWeight) ? 3 : 4.5;

    if (ratio >= threshold) {
      continue;
    }

    findings.push({
      id: stableId([
        RULE_ID,
        ctx.target.nodeId,
        node.id,
        ratio.toFixed(3),
        threshold.toFixed(1),
      ]),
      ruleId: RULE_ID,
      wcagCriterion: "1.4.3",
      severity: "critical",
      status: "failed",
      message: `Text contrast ratio ${ratio.toFixed(2)}:1 is below required ${threshold.toFixed(
        1,
      )}:1.`,
      evidence: [
        `Node ${node.id} (${node.name})`,
        `textColor=${colorToString(fg)}`,
        `backgroundColor=${colorToString(bg)}`,
      ].join(" | "),
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
