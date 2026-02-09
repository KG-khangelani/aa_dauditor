export interface ParsedFigmaUrl {
  figmaUrl: string;
  nodeId: string;
  fileKey?: string;
}

export function parseFigmaUrl(input: string): ParsedFigmaUrl {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`Invalid Figma URL: ${input}`);
  }

  if (!parsed.hostname.endsWith("figma.com")) {
    throw new Error(`Unsupported host in Figma URL: ${parsed.hostname}`);
  }

  const rawNodeId = parsed.searchParams.get("node-id");
  if (!rawNodeId) {
    throw new Error(
      `Figma URL is missing required node-id query parameter: ${input}`,
    );
  }

  const nodeId = decodeURIComponent(rawNodeId).replace(/-/g, ":");

  const pathParts = parsed.pathname.split("/").filter(Boolean);
  const fileIndex = pathParts.findIndex(
    (part) => part === "file" || part === "design",
  );
  const fileKey = fileIndex >= 0 ? pathParts[fileIndex + 1] : undefined;

  return {
    figmaUrl: parsed.toString(),
    nodeId,
    fileKey,
  };
}
