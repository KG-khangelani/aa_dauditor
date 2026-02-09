import type {
  NormalizedColor,
  NormalizedNode,
  NormalizedTarget,
} from "../core/types.js";

export function firstFill(node: NormalizedNode): NormalizedColor | undefined {
  return node.fills[0];
}

export function firstStroke(node: NormalizedNode): NormalizedColor | undefined {
  return node.strokes[0];
}

export function findNearestBackground(
  target: NormalizedTarget,
  node: NormalizedNode,
): NormalizedColor | undefined {
  const map = nodeMap(target);

  let current: NormalizedNode | undefined = node;
  while (current?.parentId) {
    const parent = map.get(current.parentId);
    if (!parent) {
      break;
    }

    if (parent.fills.length > 0) {
      return parent.fills[0];
    }

    current = parent;
  }

  // Fallback to root frame fill, then white.
  const root = target.nodes.find((n) => !n.parentId && n.fills.length > 0);
  if (root?.fills[0]) {
    return root.fills[0];
  }

  return { r: 255, g: 255, b: 255, a: 1 };
}

export function nodeMap(target: NormalizedTarget): Map<string, NormalizedNode> {
  return new Map(target.nodes.map((node) => [node.id, node]));
}

export function layerPathForNode(
  target: NormalizedTarget,
  node: NormalizedNode,
): string {
  const map = nodeMap(target);
  const path: string[] = [];
  const seen = new Set<string>();

  let current: NormalizedNode | undefined = node;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? map.get(current.parentId) : undefined;
  }

  return path.join(" > ");
}

export function likelyTextNodes(target: NormalizedTarget): NormalizedNode[] {
  return target.nodes.filter(
    (node) => node.type.toUpperCase() === "TEXT" || typeof node.text === "string",
  );
}

export function likelyNonTextContrastNodes(
  target: NormalizedTarget,
): NormalizedNode[] {
  return target.nodes.filter((node) => {
    const hasVisual = node.fills.length > 0 || node.strokes.length > 0;
    if (!hasVisual) {
      return false;
    }

    if (node.type.toUpperCase() === "TEXT") {
      return false;
    }

    return node.isInteractive || /icon|input|button|radio|checkbox|toggle|tab/i.test(node.name);
  });
}

export function likelyInteractiveNodes(target: NormalizedTarget): NormalizedNode[] {
  return target.nodes.filter((node) => node.isInteractive);
}
