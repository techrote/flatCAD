import type { SurfaceTarget } from "./surface-interaction";

/** A vertex hit zone and its translucent green sphere share the same radius. */
export const VERTEX_HOVER_RADIUS_PX=17;
export function isHighlightableSurface(target:SurfaceTarget):boolean {
  if(target.kind==="vertex")return true;
  // Ignore vertical, oblique and curved faces: only true horizontal
  // planar surfaces with a source-authorized exact Z receive cyan overlay.
  return target.z!==null&&Math.abs(target.normal[2])>=.995;
}
export function worldRadiusForScreenPixels(
  pixels:number,verticalSpan:number,cameraZoom:number,viewportHeight:number
):number{
  if(pixels<=0||verticalSpan<=0||cameraZoom<=0||viewportHeight<=0)
    throw new Error("Invalid camera/view parameters");
  return pixels*verticalSpan/cameraZoom/viewportHeight;
}
