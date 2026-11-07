/** Geometry emitted by both click–drag and two-click sketch workflows. */
import type { Point2, Profile } from "./model";

export type DrawTool = "rectangle"|"centerRectangle"|"circle"|"polygon"|"slot";
export type PolygonOptions = { sides:number; rotation:number };
const EPS=1e-6;

export function draftProfile(
  id:string, tool:DrawTool, from:Point2, to:Point2,
  square:boolean, polygon:PolygonOptions, slotRadius:number
):Profile|null{
  const dx=to.x-from.x,dy=to.y-from.y;
  if(tool==="rectangle"||tool==="centerRectangle"){
    let width=Math.abs(dx),height=Math.abs(dy);
    if(square){const side=Math.max(width,height);width=side;height=side;}
    if(width<=EPS||height<=EPS)return null;
    const centred=tool==="centerRectangle";
    return {id,kind:"rectangle",
      x:centred?from.x-width:Math.min(from.x,from.x+Math.sign(dx||1)*width),
      y:centred?from.y-height:Math.min(from.y,from.y+Math.sign(dy||1)*height),
      width:centred?width*2:width,
      height:centred?height*2:height
    };
  }
  const span=Math.hypot(dx,dy);
  if(span<=EPS)return null;
  if(tool==="circle")return {id,kind:"circle",x:from.x,y:from.y,radius:span};
  if(tool==="polygon")return {
    id,kind:"polygon",x:from.x,y:from.y,
    radius:span,sides:polygon.sides,rotation:polygon.rotation
  };
  return {id,kind:"slot",x1:from.x,y1:from.y,x2:to.x,y2:to.y,radius:slotRadius};
}
