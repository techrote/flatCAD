/** Conservative provenance matching: never delete a feature unless unambiguous. */
import { contains, outline, pointSegmentDistance } from "./geometry";
import type { CadDocument, Feature, Point2, Profile } from "./model";

export type SurfaceTarget={
  kind:"face"|"vertex";
  point:[number,number,number];
  z:number|null; // exact known horizontal source plane, or exact vertex elevation
  normal:[number,number,number];
};
function boundaryDistance(profile:Profile,point:Point2):number{
  const edges=outline(profile);
  if(edges.length<2)return Number.POSITIVE_INFINITY;
  return Math.min(...edges.map((p,i)=>pointSegmentDistance(
    point,p,edges[(i+1)%edges.length]
  )));
}
export function featureForSurface(
  doc:CadDocument,target:SurfaceTarget,tolerance=.01
):Feature|null{
  const [x,y,z]=target.point;
  const profiles=new Map(doc.profiles.map(p=>[p.id,p]));
  const found:Feature[]=[];
  for(const feature of doc.features){
    const p=profiles.get(feature.profileId);if(!p)continue;
    const low=Math.min(feature.z,feature.z+feature.depth);
    const high=Math.max(feature.z,feature.z+feature.depth);
    if(z<low-tolerance||z>high+tolerance)continue;
    if(target.z!==null){
      const onEnd=Math.abs(target.z-feature.z)<=tolerance||
                  Math.abs(target.z-(feature.z+feature.depth))<=tolerance;
      if(!onEnd)continue;
      if(!contains(p,{x,y}) && boundaryDistance(p,{x,y})>tolerance)continue;
    }else if(boundaryDistance(p,{x,y})>tolerance)continue;
    found.push(feature);
  }
  return found.length===1?found[0]:null;
}

export function formatSurfaceTarget(target:SurfaceTarget|null,field:"z"|"depth"|null,startZ:number):string {
  if(!target)return "";
  const label=target.kind==="vertex"?"Vertex":"Face";
  if(target.z===null)return label+" · nonhorizontal (no Z latch)";
  if(field==="z")return label+" · Z "+target.z+" mm → Start Z";
  if(field==="depth")return label+" · Depth "+Number((target.z-startZ).toFixed(5))+" mm";
  return label+" · Z "+target.z+" mm";
}
