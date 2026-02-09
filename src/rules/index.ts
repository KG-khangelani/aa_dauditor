import type { Finding, RuleDefinition, RuleEvaluationContext } from "../core/types.js";
import { nonTextContrastRule } from "./rule-nontext-contrast.js";
import { targetSizeRule } from "./rule-target-size.js";
import { textContrastRule } from "./rule-contrast-text.js";

export const RULES: RuleDefinition[] = [
  textContrastRule,
  nonTextContrastRule,
  targetSizeRule,
];

export function executeRules(
  ctx: RuleEvaluationContext,
  enabledRules: RuleDefinition[],
): Finding[] {
  return enabledRules.flatMap((rule) => rule.evaluate(ctx));
}
