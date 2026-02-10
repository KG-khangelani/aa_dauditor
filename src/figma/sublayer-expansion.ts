export interface MetadataNodeSummary {
  id: string;
  name: string;
  type: string;
  parentId?: string;
  depth: number;
  width?: number;
  height?: number;
  hidden: boolean;
  zeroOpacity: boolean;
}

interface StackEntry {
  id?: string;
  depth: number;
  hidden: boolean;
  zeroOpacity: boolean;
}

export function parseMetadataXmlNodes(xml: string): MetadataNodeSummary[] {
  const nodes: MetadataNodeSummary[] = [];
  const stack: StackEntry[] = [];
  const tagRegex = /<\/?([a-zA-Z0-9_-]+)([^>]*)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(xml)) !== null) {
    const full = match[0];
    const tagName = match[1];
    const attrBlock = match[2] ?? "";

    if (full.startsWith("</")) {
      stack.pop();
      continue;
    }

    const attrs = parseXmlAttributes(attrBlock);
    const inheritedHidden = stack.some((entry) => entry.hidden);
    const inheritedZeroOpacity = stack.some((entry) => entry.zeroOpacity);
    const hidden = inheritedHidden || attrs.hidden === "true" || attrs.visible === "false";
    const zeroOpacity =
      inheritedZeroOpacity || (parseFiniteNumber(attrs.opacity) ?? 1) <= 0;

    const id = attrs.id;
    const depth = stack.filter((entry) => Boolean(entry.id)).length;

    if (id) {
      nodes.push({
        id,
        name: attrs.name ?? tagName,
        type: tagName.replace(/-/g, "_").toUpperCase(),
        parentId: nearestParentId(stack),
        depth,
        width: parseFiniteNumber(attrs.width),
        height: parseFiniteNumber(attrs.height),
        hidden,
        zeroOpacity,
      });
    }

    if (!full.endsWith("/>")) {
      stack.push({
        id,
        depth,
        hidden,
        zeroOpacity,
      });
    }
  }

  return nodes;
}

export function selectSublayerCandidatesFromMetadata(
  metadataXml: string,
  rootNodeId: string,
  limit: number,
): string[] {
  if (!Number.isFinite(limit) || limit <= 0) {
    return [];
  }

  const nodes = parseMetadataXmlNodes(metadataXml)
    .filter((node) => node.id !== rootNodeId)
    .filter((node) => !node.hidden && !node.zeroOpacity);

  const immediateChildren = nodes.filter((node) => node.parentId === rootNodeId);
  const nearChildren = nodes.filter(
    (node) => node.parentId !== rootNodeId && node.depth <= 2,
  );

  const pool = immediateChildren.length > 0 ? [...immediateChildren, ...nearChildren] : nodes;

  const ranked = [...pool]
    .sort((a, b) => scoreNode(b) - scoreNode(a) || nodeArea(b) - nodeArea(a))
    .slice(0, limit)
    .map((node) => node.id);

  return Array.from(new Set(ranked));
}

export function selectAncestorCandidatesFromMetadata(
  metadataXml: string,
  nodeId: string,
  limit: number,
): string[] {
  if (!Number.isFinite(limit) || limit <= 0) {
    return [];
  }

  const nodes = parseMetadataXmlNodes(metadataXml);
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const out: string[] = [];
  const visited = new Set<string>([nodeId]);

  let current = byId.get(nodeId);
  while (current?.parentId && out.length < limit) {
    const parentId = current.parentId;
    if (visited.has(parentId)) {
      break;
    }
    visited.add(parentId);
    out.push(parentId);
    current = byId.get(parentId);
  }

  return out;
}

function scoreNode(node: MetadataNodeSummary): number {
  const type = node.type.toUpperCase();
  const name = node.name;

  let score = 0;

  if (type === "TEXT") {
    score += 45;
  }

  if (/INSTANCE|BUTTON|INPUT|COMPONENT|FRAME|RECTANGLE|ROUNDED_RECTANGLE/.test(type)) {
    score += 20;
  }

  if (/button|input|field|search|label|title|tab|menu|toggle|checkbox|radio|link|icon/i.test(name)) {
    score += 25;
  }

  if (node.depth === 1) {
    score += 12;
  }

  const area = nodeArea(node);
  score += Math.min(35, Math.log10(area + 1) * 9);

  return score;
}

function nodeArea(node: Pick<MetadataNodeSummary, "width" | "height">): number {
  if (!node.width || !node.height) {
    return 0;
  }

  return Math.max(0, node.width * node.height);
}

function parseXmlAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z_:][a-zA-Z0-9_:-]*)="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(raw)) !== null) {
    attrs[match[1]] = match[2];
  }

  return attrs;
}

function parseFiniteNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function nearestParentId(stack: StackEntry[]): string | undefined {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].id) {
      return stack[i].id;
    }
  }

  return undefined;
}
