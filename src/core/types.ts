export type Severity = "blocker" | "critical" | "major" | "minor";

export type FindingStatus = "failed" | "needs-manual-review";

export type ReportFormat = "json" | "html" | "both";

export interface Suppression {
  ruleId: string;
  targetId: string;
  reason: string;
  expiresOn: string;
  owner?: string;
}

export interface ActiveSuppression extends Suppression {
  matchedAt: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  wcagCriterion: string;
  severity: Severity;
  status: FindingStatus;
  message: string;
  recommendation?: string;
  evidence?: string;
  targetRef: {
    figmaUrl: string;
    nodeId: string;
    frameName: string;
    layerPath?: string;
  };
  suppressed?: ActiveSuppression;
}

export interface ManualCheck {
  id: string;
  wcagCriterion: string;
  prompt: string;
  targetRef: {
    figmaUrl: string;
    nodeId: string;
    frameName: string;
    layerPath?: string;
  };
}

export interface TargetResult {
  figmaUrl: string;
  nodeId: string;
  frameName: string;
  screenshotPath?: string;
  findings: Finding[];
  manualChecks: ManualCheck[];
  warnings: string[];
}

export interface AuditSummary {
  totalTargets: number;
  totalFindings: number;
  suppressedFindings: number;
  manualReviewFindings: number;
  bySeverity: Record<Severity, number>;
  failedTargets: number;
  warnings: string[];
}

export interface AuditReport {
  runId: string;
  startedAt: string;
  finishedAt: string;
  wcagVersion: "2.2";
  level: "AA";
  summary: AuditSummary;
  targets: TargetResult[];
  findings: Finding[];
  manualChecks: ManualCheck[];
}

export interface NormalizedColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface NormalizedBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedNode {
  id: string;
  name: string;
  type: string;
  parentId?: string;
  bounds?: NormalizedBounds;
  fills: NormalizedColor[];
  strokes: NormalizedColor[];
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeightPx?: number;
  isInteractive: boolean;
}

export interface NormalizedTarget {
  figmaUrl: string;
  nodeId: string;
  frameName: string;
  nodes: NormalizedNode[];
  warnings: string[];
}

export interface RuleEvaluationContext {
  target: NormalizedTarget;
  reportStartIso: string;
  designSystemColors?: Record<string, string>;
}

export interface RuleDefinition {
  id: string;
  wcagCriterion: string;
  title: string;
  description: string;
  defaultSeverity: Severity;
  evaluate: (ctx: RuleEvaluationContext) => Finding[];
}

export interface RuleConfig {
  enabled: boolean;
  severity: Severity;
}

export interface AppConfig {
  wcagVersion: "2.2";
  level: "AA";
  failOn: Severity[];
  report: {
    includeScreenshots: boolean;
    formats: Array<"json" | "html">;
  };
  rules: Record<string, RuleConfig>;
  suppressions: Suppression[];
  designSystemColors: Record<string, string>;
}

export interface AuditTargetInput {
  figmaUrl: string;
}

export interface FigmaTargetPayload {
  figmaUrl: string;
  nodeId: string;
  frameName: string;
  designContext: unknown;
  expandedDesignContexts?: Array<{
    nodeId: string;
    context: unknown;
  }>;
  metadata?: unknown;
  designSystemColors?: Record<string, string>;
  screenshot?: {
    bytes?: Uint8Array;
    ext?: "png" | "jpg" | "jpeg" | "webp";
    sourceUrl?: string;
  };
  warnings: string[];
}

export interface FigmaClient {
  fetchTarget(figmaUrl: string): Promise<FigmaTargetPayload>;
}

export interface AuditRunOptions {
  targets: AuditTargetInput[];
  outDir: string;
  config: AppConfig;
  reportFormat: ReportFormat;
  failOn: Severity[];
}

export interface AuditRunDeps {
  figmaClient: FigmaClient;
  now: () => Date;
  runIdFactory: () => string;
}
