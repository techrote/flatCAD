/** Overlay placement, in canvas-local CSS pixels. Major-grid distance is never a CSS constant. */
export type Rectangle2 = { left: number; top: number; right: number; bottom: number };
export type Dimensions = { width: number; height: number };
export type Position = { x: number; y: number; side: "right" | "left" | "below" | "above" };
const overlap = (a: Rectangle2, b: Rectangle2) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const boxAt = (x: number, y: number, d: Dimensions): Rectangle2 =>
  ({ left: x, top: y, right: x + d.width, bottom: y + d.height });

/** Prefer exactly one major-grid interval between popover and geometry.
 *  Try the opposite sides before moving closer due to an undersized viewport.
 *  Penalize intersection with the extrusion arrow more than ordinary geometry.
 */
export function placeExtrudeMenu(args: {
  viewport: Dimensions; selection: Rectangle2; popup: Dimensions;
  majorGridPixels: number; arrow?: { x: number; y: number } | null;
}): Position {
  const { viewport, selection: a, popup: p } = args;
  const gap = Math.max(0, args.majorGridPixels);
  const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
  const candidates: Position[] = [
    { side: "right", x: a.right + gap, y: cy - p.height / 2 },
    { side: "left", x: a.left - gap - p.width, y: cy - p.height / 2 },
    { side: "below", x: cx - p.width / 2, y: a.bottom + gap },
    { side: "above", x: cx - p.width / 2, y: a.top - gap - p.height },
  ];
  const padding = 10;
  const inBounds = (pos: Position) =>
    pos.x >= padding && pos.y >= padding &&
    pos.x + p.width <= viewport.width - padding &&
    pos.y + p.height <= viewport.height - padding;
  const arrow: Rectangle2 | null = args.arrow
    ? { left: args.arrow.x - 28, right: args.arrow.x + 50, top: args.arrow.y - 20, bottom: args.arrow.y + 20 }
    : null;
  const score = (pos: Position) => {
    const rect = boxAt(pos.x, pos.y, p);
    return overlap(rect, a) * 10 + (arrow ? overlap(rect, arrow) * 60 : 0);
  };
  const clean = candidates.filter(pos => inBounds(pos) && score(pos) === 0);
  if (clean.length > 0) return clean[0];
  const fitting = candidates.filter(inBounds).sort((x, y) => score(x) - score(y));
  if (fitting.length > 0) return fitting[0];
  // On a tiny canvas no candidate fits: clamp and minimize obstruction.
  const clamped = candidates.map(c => ({
    ...c,
    x: Math.max(padding, Math.min(viewport.width - p.width - padding, c.x)),
    y: Math.max(padding, Math.min(viewport.height - p.height - padding, c.y)),
  }));
  clamped.sort((a, b) => score(a) - score(b));
  return clamped[0];
}
