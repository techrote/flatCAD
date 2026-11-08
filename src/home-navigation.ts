/** Adaptive Home is derived from the actual camera direction, not last-click memory. */
export type HomeSide="standard"|"underground";
export type HomeDirection={x:number;y:number;z:number};
const HX=130,HY=-125,HZ=115;
const HOME_NORM=Math.hypot(HX,HY,HZ);
const MATCH_COS=Math.cos(3*Math.PI/180);
export function nextHomeSide(offset:HomeDirection):HomeSide{
  const length=Math.hypot(offset.x,offset.y,offset.z);
  if(!Number.isFinite(length)||length<1e-9)return "standard";
  const above=(offset.x*HX+offset.y*HY+offset.z*HZ)/(length*HOME_NORM);
  const below=(offset.x*HX+offset.y*HY-offset.z*HZ)/(length*HOME_NORM);
  if(above>=MATCH_COS)return "underground";
  if(below>=MATCH_COS)return "standard";
  return offset.z<0?"underground":"standard";
}
