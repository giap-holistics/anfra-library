interface Shaped {
  nodes: { id: string }[];
  edges: { id: string }[];
}

/** A graph's shape: its node and edge ids. A new shape is laid out again, and fitted to the view. */
export function shapeOf(graph: Shaped): string {
  return `${graph.nodes.map((n) => n.id).join()}|${graph.edges.map((e) => e.id).join()}`;
}

/** What a layout was made for: the shape, and each card's measured size in whole pixels. */
export function layoutKey(
  graph: Shaped,
  sizeOf: (id: string) => { width: number; height: number } | undefined,
): string {
  const sizes = graph.nodes.map((n) => {
    const size = sizeOf(n.id);
    return size ? `${Math.round(size.width)}x${Math.round(size.height)}` : '?';
  });
  return `${shapeOf(graph)}|${sizes.join()}`;
}
