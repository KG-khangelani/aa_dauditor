import { MANUAL_CHECK_CATALOG } from "../core/ruleCatalog.js";
import { stableId } from "../core/id.js";
import type { ManualCheck, NormalizedTarget } from "../core/types.js";

export function buildManualChecklist(target: NormalizedTarget): ManualCheck[] {
  return MANUAL_CHECK_CATALOG.map((item) => ({
    id: stableId([item.id, target.nodeId]),
    wcagCriterion: item.wcagCriterion,
    prompt: item.prompt,
    targetRef: {
      figmaUrl: target.figmaUrl,
      nodeId: target.nodeId,
      frameName: target.frameName,
      layerPath: target.frameName,
    },
  }));
}
