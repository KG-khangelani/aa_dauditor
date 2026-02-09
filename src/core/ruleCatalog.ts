import type { RuleDefinition } from "./types.js";

export const RULE_CATALOG: ReadonlyArray<Omit<RuleDefinition, "evaluate">> = [
  {
    id: "WCAG-1.4.3-text-contrast-minimum",
    wcagCriterion: "1.4.3",
    title: "Text contrast minimum",
    description:
      "Text and images of text must meet contrast ratio thresholds of 4.5:1 (normal text) or 3:1 (large text).",
    defaultSeverity: "critical",
  },
  {
    id: "WCAG-1.4.11-nontext-contrast",
    wcagCriterion: "1.4.11",
    title: "Non-text contrast",
    description:
      "Visual information needed to identify UI components and states should have contrast ratio at least 3:1.",
    defaultSeverity: "major",
  },
  {
    id: "WCAG-2.5.8-target-size-minimum",
    wcagCriterion: "2.5.8",
    title: "Target size minimum",
    description:
      "Pointer targets should be at least 24 by 24 CSS pixels unless an exception applies.",
    defaultSeverity: "blocker",
  },
] as const;

export const MANUAL_CHECK_CATALOG = [
  {
    id: "MANUAL-WCAG-1.3.1",
    wcagCriterion: "1.3.1",
    prompt:
      "Verify structure and relationships are programmatically determinable (headings, grouped controls, labels).",
  },
  {
    id: "MANUAL-WCAG-1.4.1",
    wcagCriterion: "1.4.1",
    prompt:
      "Verify color is not the only means used to convey state or meaning.",
  },
  {
    id: "MANUAL-WCAG-2.4.7",
    wcagCriterion: "2.4.7",
    prompt:
      "Verify focus indicators are clearly visible for all interactive components.",
  },
  {
    id: "MANUAL-WCAG-2.4.11",
    wcagCriterion: "2.4.11",
    prompt:
      "Verify focused elements are not fully obscured by fixed/sticky UI.",
  },
  {
    id: "MANUAL-WCAG-3.3.2",
    wcagCriterion: "3.3.2",
    prompt:
      "Verify form controls include persistent labels/instructions and clear error guidance.",
  },
] as const;
