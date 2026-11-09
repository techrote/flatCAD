/** Springy tool glyph orbit: presentation-only, one angle and momentum value.
 * The glyph is on a ring around the exact native Sketch crosshair hotspot.
 * No particle solver, canvas redraw or geometry-dependent calculation.
 */
import type {SketchTool} from "./sketch-canvas-v2";
export const SKETCH_TOOL_GLYPHS:Record<SketchTool,string|null>={
  select:null,line:"╱",rectangle:"▭",centerRectangle:"▣",
  circle:"◯",polygon:"⬡",slot:"⬭",pan:null,extrude:"↥"
};
export type CursorPoint={x:number;y:number};
export type CursorExtent={width:number;height:number};
export type CursorOrbit={angle:number;velocity:number};
export const CURSOR_RADIUS=42;
export const INITIAL_ORBIT:CursorOrbit={angle:.55,velocity:0};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
/** Moving toward the badge rotates it aside; moving away pulls it along.
 * Tangential cursor motion adds orbital momentum. Strict speed bound prevents
 * long-distance pointer jumps launching a runaway spin.
 */
export function cursorOrbitPush(state:CursorOrbit,delta:CursorPoint):CursorOrbit{
  const c=Math.cos(state.angle),s=Math.sin(state.angle);
  const dx=clamp(delta.x,-80,80),dy=clamp(delta.y,-80,80);
  const tangent=(dx*s-dy*c)/CURSOR_RADIUS;
  const approach=Math.max(0,(dx*c+dy*s)/CURSOR_RADIUS);
  // Positive rotation pushes the initial lower-right glyph clockwise/down
  // if the cursor approaches it head on. Existing motion picks the side.
  const side=state.velocity<-.025?-1:1;
  const impulse=clamp(tangent*.42+side*Math.min(.55,approach*.65),-.45,.45);
  const velocity=clamp(state.velocity*.62+impulse,-.35,.35);
  return {angle:state.angle+velocity,velocity};
}
/** Decay only while angular movement remains visible; no perpetual RAF loop. */
export function cursorOrbitSettle(state:CursorOrbit):CursorOrbit{
  const velocity=Math.abs(state.velocity)<.001?0:state.velocity*.81;
  return {angle:state.angle+velocity,velocity};
}
/** The centre stays a fixed target radius away from the crosshair.
 * Near viewport edges the drawn badge is clamped, never intercepting input.
 */
export function toolBadgePosition(
  pointer:CursorPoint,extent:CursorExtent,angle=INITIAL_ORBIT.angle,
  badge=24,radius=CURSOR_RADIUS
):CursorPoint{
  const pad=3;
  const w=Math.max(badge+2*pad,extent.width);
  const h=Math.max(badge+2*pad,extent.height);
  const x=pointer.x+Math.cos(angle)*radius-badge/2;
  const y=pointer.y+Math.sin(angle)*radius-badge/2;
  return {
    x:Math.round(clamp(x,pad,w-badge-pad)),
    y:Math.round(clamp(y,pad,h-badge-pad))
  };
}
