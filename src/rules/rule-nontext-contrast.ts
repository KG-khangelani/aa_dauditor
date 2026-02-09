import { colorToString, contrastRatio } from "../core/color.js";
import { stableId } from "../core/id.js";
import type { Finding, RuleDefinition, RuleEvaluationContext } from "../core/types.js";
import {
  findNearestBackground,
  firstFill,
  firstStroke,
  layerPathForNode,
  likelyNonTextContrastNodes,
} from "../normalize/query.js";
import {
  recommendDesignSystemColorsForContrast,
  recommendTokensForManualColorReview,
} from "./recommend-color.js";

const RULE_ID = "WCAG-1.4.11-nontext-contrast";

export const nonTextContrastRule: RuleDefinition = {
  id: RULE_ID,
  wcagCriterion: "1.4.11",
  title: "Non-text contrast",
  description:
    "UI components and visual state indicators should meet 3:1 contrast ratio.",
  defaultSeverity: "major",
  evaluate: (ctx) => evaluateNonTextContrast(ctx),
};

function evaluateNonTextContrast(ctx: RuleEvaluationContext): Finding[] {
  const findings: Finding[] = [];

  for (const node of likelyNonTextContrastNodes(ctx.target)) {
    const fg = firstStroke(node) ?? firstFill(node);
    const bg = findNearestBackground(ctx.target, node);
    const layerPath = layerPathForNode(ctx.target, node);

    if (!fg || !bg) {
      findings.push({
        id: stableId([RULE_ID, ctx.target.nodeId, node.id, "manual"]),
        ruleId: RULE_ID,
        wcagCriterion: "1.4.11",
        severity: "major",
        status: "needs-manual-review",
        message:
          "Could not reliably determine non-text foreground/background colors.",
        recommendation: recommendTokensForManualColorReview(
          ctx.designSystemColors,
        ),
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

    if (ratio >= 3) {
      continue;
    }

    findings.push({
      id: stableId([RULE_ID, ctx.target.nodeId, node.id, ratio.toFixed(3)]),
      ruleId: RULE_ID,
      wcagCriterion: "1.4.11",
      severity: "major",
      status: "failed",
      message: `Non-text contrast ratio ${ratio.toFixed(2)}:1 is below required 3.0:1.`,
      recommendation: recommendDesignSystemColorsForContrast(
        ctx.designSystemColors,
        fg,
        bg,
        3,
      ),
      evidence: [
        `Node ${node.id} (${node.name})`,
        `foreground=${colorToString(fg)}`,
        `background=${colorToString(bg)}`,
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
