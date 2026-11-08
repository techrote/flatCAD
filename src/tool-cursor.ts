/** Presentation-only glyph next to the native Sketch crosshair.
 * Keeps the precise cursor hotspot unobscured; never enters CAD geometry.
 */
import type {SketchTool} from "./sketch-canvas-v2";
export const SKETCH_TOOL_GLYPHS:Record<SketchTool,string|null>={
  select:null,line:"╱",rectangle:"▭",centerRectangle:"▣",
  circle:"◯",polygon:"⬡",slot:"⬭",pan:null,extrude:"↥"
};
export type CursorPoint={x:number;y:number};
export type CursorExtent={width:number;height:number};
/** Tool badge stays inside sketch even at viewport edges.
 * The preferred quadrant is below and to the LEFT of the crosshair. */
export function toolBadgePosition(
  pointer:CursorPoint,extent:CursorExtent,badge=24,gap=11
):CursorPoint{
  const pad=3;
  const w=Math.max(badge+2*pad,extent.width);
  const h=Math.max(badge+2*pad,extent.height);
  const x=pointer.x-badge-gap>=pad
    ?pointer.x-badge-gap:pointer.x+gap;
  const y=pointer.y+gap+badge<=h-pad
    ?pointer.y+gap:pointer.y-gap-badge;
  return {
    x:Math.round(Math.max(pad,Math.min(w-badge-pad,x))),
    y:Math.round(Math.max(pad,Math.min(h-badge-pad,y)))
  };
}
