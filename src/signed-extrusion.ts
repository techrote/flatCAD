/** Signed depth is stored in feature history; OCCT gets the canonical positive Z interval. */
export function signedInterval(z:number,depth:number):{lower:number,upper:number,height:number} {
  if(!Number.isFinite(z)||!Number.isFinite(depth)||depth===0)
    throw new Error("Extrusion start and non-zero signed depth must be finite");
  const end=z+depth;
  if(!Number.isFinite(end))throw new Error("Extrusion endpoint is not finite");
  return {lower:Math.min(z,end),upper:Math.max(z,end),height:Math.abs(depth)};
}
/** Focused Depth field means the signed delta from Start Z to the clicked planar face. */
export function depthToFace(startZ:number,faceZ:number):number {
  if(!Number.isFinite(startZ)||!Number.isFinite(faceZ))
    throw new Error("Face and start heights must be finite");
  return Number((faceZ-startZ).toPrecision(14));
}
/** Prefer original design planes over rounded display-mesh intersection coordinates. */
export function exactFaceElevation(z:number,planes:readonly number[],tolerance=0.001):number|null {
  if(!Number.isFinite(z))return null;
  let nearest:number|null=null,difference=tolerance;
  for(const value of planes){
    const error=Math.abs(value-z);
    if(error<=difference){difference=error;nearest=value;}
  }
  return nearest;
}
