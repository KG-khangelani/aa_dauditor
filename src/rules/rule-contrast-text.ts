import { colorToString, contrastRatio, isLargeText } from "../core/color.js";
import { stableId } from "../core/id.js";
import type { Finding, RuleDefinition, RuleEvaluationContext } from "../core/types.js";
import {
  firstFill,
  layerPathForNode,
  likelyTextNodes,
  resolveEffectiveBackground,
} from "../normalize/query.js";
import {
  recommendDesignSystemColorsForContrast,
  recommendTokensForManualColorReview,
} from "./recommend-color.js";

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
    const directFg = firstFill(node);
    const bgResolution = resolveEffectiveBackground(ctx.target, node);
    const usesDocumentFallbackBackground = Boolean(
      bgResolution.sourceLayerPath?.startsWith("[design-context-fallback]"),
    );
    const sampledBg =
      ctx.sampleBackgroundColor &&
      (!bgResolution.color || usesDocumentFallbackBackground)
        ? ctx.sampleBackgroundColor(node, directFg)
        : undefined;
    const bg = sampledBg ?? bgResolution.color;
    const sampledFg =
      !directFg && bg && ctx.sampleForegroundColor
        ? ctx.sampleForegroundColor(node, bg)
        : undefined;
    const fg = directFg ?? sampledFg;
    const layerPath = layerPathForNode(ctx.target, node);

    if (!fg || !bg) {
      const missingPart = !fg
        ? "text foreground color"
        : bgResolution.reason ?? "effective background color";
      findings.push({
        id: stableId([RULE_ID, ctx.target.nodeId, node.id, "manual"]),
        ruleId: RULE_ID,
        wcagCriterion: "1.4.3",
        severity: "major",
        status: "needs-manual-review",
        message: `Could not reliably determine text/background colors for contrast calculation (${missingPart}).`,
        recommendation: recommendTokensForManualColorReview(
          ctx.designSystemColors,
        ),
        evidence: [
          `Node ${node.id} (${node.name})`,
          sampledBg
            ? "backgroundSource=[screenshot-von-neumann]"
            : bgResolution.sourceLayerPath
            ? `backgroundSource=${bgResolution.sourceLayerPath}`
            : undefined,
          sampledFg ? "foregroundSource=[screenshot-text-region]" : undefined,
          bgResolution.reason ? `backgroundReason=${bgResolution.reason}` : undefined,
        ]
          .filter(Boolean)
          .join(" | "),
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
      recommendation: recommendDesignSystemColorsForContrast(
        ctx.designSystemColors,
        fg,
        bg,
        threshold,
      ),
      evidence: [
        `Node ${node.id} (${node.name})`,
        `textColor=${colorToString(fg)}`,
        `backgroundColor=${colorToString(bg)}`,
        sampledFg ? "foregroundSource=[screenshot-text-region]" : undefined,
        sampledBg
          ? "backgroundSource=[screenshot-von-neumann]"
          : bgResolution.sourceLayerPath
          ? `backgroundSource=${bgResolution.sourceLayerPath}`
          : undefined,
      ]
        .filter(Boolean)
        .join(" | "),
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
