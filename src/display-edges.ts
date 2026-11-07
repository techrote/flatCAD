/** Display-only suppression of OCC periodic cylinder seam edges.
 * CAD topology, B-rep, ray-picking vertices and STEP output are unchanged.
 * Only edges genuinely axial and on an authored circular wall are removed.
 */
import type {GeometryMesh} from "./kernel-protocol";
import type {CadDocument,Circle} from "./model";
export function withoutCylinderSeams(mesh:GeometryMesh|null,doc:CadDocument):GeometryMesh|null{
  if(!mesh||!mesh.edgeLines.length)return mesh;
  const circles=doc.profiles.filter((p):p is Circle=>p.kind==="circle"&&
    doc.features.some(f=>f.profileId===p.id));
  if(!circles.length)return mesh;
  const edges=mesh.edgeLines,kept:number[]=[];
  for(let i=0;i+5<edges.length;i+=6){
    const [ax,ay,az,bx,by,bz]=edges.slice(i,i+6);
    const tolerance=.0001*Math.max(1,Math.abs(ax),Math.abs(ay),Math.abs(bx),Math.abs(by));
    const axial=Math.abs(ax-bx)<tolerance&&Math.abs(ay-by)<tolerance&&
      Math.abs(az-bz)>tolerance;
    const seam=axial&&circles.some(c=>{
      const radial=Math.hypot(ax-c.x,ay-c.y);
      if(Math.abs(radial-c.radius)>Math.max(tolerance,c.radius*.0001))return false;
      return doc.features.some(f=>{
        if(f.profileId!==c.id)return false;
        const lower=Math.min(f.z,f.z+f.depth),upper=Math.max(f.z,f.z+f.depth);
        return Math.min(az,bz)>=lower-tolerance&&Math.max(az,bz)<=upper+tolerance;
      });
    });
    if(!seam)kept.push(ax,ay,az,bx,by,bz);
  }
  return kept.length===edges.length?mesh:{...mesh,edgeLines:kept};
}
