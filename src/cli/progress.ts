import type { AuditProgressEvent, AuditProgressStage } from "../core/types.js";

const SPINNER_FRAMES = ["|", "/", "-", "\\"];

const STAGE_LABELS: Record<AuditProgressStage, string> = {
  fetch: "fetch",
  normalize: "normalize",
  screenshot: "screenshot",
  rules: "rules",
  suppressions: "suppressions",
  "manual-checklist": "manual-checklist",
  "target-finalize": "finalize-target",
  report: "write-report",
};

interface ActiveStage {
  stage: AuditProgressStage;
  targetIndex: number;
  totalTargets: number;
  startedAt: number;
}

export class TerminalProgressRenderer {
  private spinnerTimer: NodeJS.Timeout | undefined;

  private spinnerFrame = 0;

  private activeStage: ActiveStage | undefined;

  constructor(private readonly isTty: boolean) {}

  onEvent(event: AuditProgressEvent): void {
    if (event.type === "target-start") {
      this.stopSpinner();
      this.writeLine(
        `=> [${event.targetIndex}/${event.totalTargets}] target ${event.figmaUrl}`,
      );
      return;
    }

    if (event.type === "stage-start") {
      this.activeStage = {
        stage: event.stage,
        targetIndex: event.targetIndex,
        totalTargets: event.totalTargets,
        startedAt: Date.now(),
      };
      this.startSpinner();
      return;
    }

    if (event.type === "stage-end") {
      const startedAt = this.activeStage?.startedAt ?? Date.now();
      const elapsed = formatElapsed(Date.now() - startedAt);
      this.stopSpinner();
      const status = event.success === false ? "failed" : "done";
      const detail = event.message ? ` (${event.message})` : "";
      this.writeLine(
        `=> [${event.targetIndex}/${event.totalTargets}] ${labelForStage(
          event.stage,
        )} ${status} in ${elapsed}${detail}`,
      );
      this.activeStage = undefined;
      return;
    }

    if (event.type === "target-end") {
      const status = event.success === false ? "failed" : "completed";
      const detail = event.message ? ` (${event.message})` : "";
      this.writeLine(
        `=> [${event.targetIndex}/${event.totalTargets}] target ${status}${detail}`,
      );
      return;
    }
  }

  close(): void {
    this.stopSpinner();
  }

  private startSpinner(): void {
    if (!this.isTty || !this.activeStage) {
      return;
    }

    this.stopSpinner();
    this.spinnerTimer = setInterval(() => {
      if (!this.activeStage) {
        return;
      }
      const frame = SPINNER_FRAMES[this.spinnerFrame % SPINNER_FRAMES.length];
      this.spinnerFrame += 1;
      const elapsed = formatElapsed(Date.now() - this.activeStage.startedAt);
      process.stdout.write(
        `\r=> [${this.activeStage.targetIndex}/${this.activeStage.totalTargets}] ${labelForStage(
          this.activeStage.stage,
        )} ${frame} ${elapsed}`,
      );
    }, 125);
  }

  private stopSpinner(): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = undefined;
      if (this.isTty) {
        process.stdout.write("\r");
      }
    }
  }

  private writeLine(line: string): void {
    if (this.isTty) {
      process.stdout.write(`${line}\n`);
      return;
    }
    console.log(line);
  }
}

function labelForStage(stage: AuditProgressStage): string {
  return STAGE_LABELS[stage] ?? stage;
}

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
