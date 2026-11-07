import type { GeometryMesh, KernelHistoryFrame } from "./kernel-protocol";

/** Model-space isometric projection; thumbnail is a derivative of the OCC
 *  intermediate B-rep, not a serialized CAD object or a WebGL screenshot.
 *  The red cut overlay includes the complete cutter (including overshoot).
 */
type MeshPoint={u:number,v:number,depth:number};
const project=(x:number,y:number,z:number):MeshPoint=>({
  u:(x-y)*.70710678118,
  v:(x+y)*.40824829046-z*.8164965809,
  depth:(x+y)*.40824829046+z*.57735026919,
});
export function thumbnailBounds(meshes:readonly (GeometryMesh|null)[]):{
  minU:number,maxU:number,minV:number,maxV:number
}{
  const all=meshes.flatMap(m=>m?.vertices??[]);
  if(all.length===0)return {minU:-1,maxU:1,minV:-1,maxV:1};
  let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
  for(let i=0;i+2<all.length;i+=3){
    const {u,v}=project(all[i],all[i+1],all[i+2]);
    minU=Math.min(minU,u);maxU=Math.max(maxU,u);
    minV=Math.min(minV,v);maxV=Math.max(maxV,v);
  }
  return {minU,maxU,minV,maxV};
}
function triangles(mesh:GeometryMesh):{
  pts:[MeshPoint,MeshPoint,MeshPoint]; depth:number;light:number
}[]{
  const positions=mesh.vertices,indices=mesh.triangles;
  const result:{pts:[MeshPoint,MeshPoint,MeshPoint];depth:number;light:number}[]=[];
  const n=indices.length/3;
  // Large models use a bounded sampling budget only for a 176px thumbnail.
  const stride=Math.max(1,Math.ceil(n/14000));
  for(let i=0;i<n;i+=stride){
    const ids=[indices[i*3],indices[i*3+1],indices[i*3+2]];
    const q=ids.map(id=>[positions[id*3],positions[id*3+1],positions[id*3+2]]);
    if(q.some(p=>p.some(v=>!Number.isFinite(v))))continue;
    const p=q.map(v=>project(v[0],v[1],v[2])) as [MeshPoint,MeshPoint,MeshPoint];
    const [a,b,c]=q;
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],
      vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    const mag=Math.hypot(nx,ny,nz)||1;
    const light=.35+.38*Math.abs(nz/mag)+.19*Math.abs(nx/mag)+.08*Math.abs(ny/mag);
    result.push({pts:p,depth:(p[0].depth+p[1].depth+p[2].depth)/3,light});
  }
  result.sort((a,b)=>a.depth-b.depth);
  return result;
}
export function drawHistoryThumbnail(
  canvas:HTMLCanvasElement,frame:KernelHistoryFrame
):void{
  const ctx=canvas.getContext("2d");
  if(!ctx)return;
  const w=176,h=96;
  const dpr=Math.max(1,Math.min(2,typeof devicePixelRatio==="number"?devicePixelRatio:1));
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle="#0b1928";ctx.fillRect(0,0,w,h);
  ctx.strokeStyle="#20384e";ctx.lineWidth=.7;
  for(let x=0;x<w;x+=16){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=0;y<h;y+=16){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  const cutter=frame.operation==="cut"?frame.cutTool?.mesh??null:null;
  const bounds=thumbnailBounds([frame.mesh,cutter]);
  const sx=Math.max(1e-6,bounds.maxU-bounds.minU),
    sy=Math.max(1e-6,bounds.maxV-bounds.minV);
  const scale=Math.min((w-20)/sx,(h-20)/sy,8);
  const centerU=(bounds.maxU+bounds.minU)/2,centerV=(bounds.maxV+bounds.minV)/2;
  const x=(p:MeshPoint)=>w/2+(p.u-centerU)*scale;
  const y=(p:MeshPoint)=>h/2+(p.v-centerV)*scale;
  const fill=(mesh:GeometryMesh,red:boolean)=>{
    const list=triangles(mesh);
    for(const tri of list){
      const pts=tri.pts;
      ctx.beginPath();ctx.moveTo(x(pts[0]),y(pts[0]));
      ctx.lineTo(x(pts[1]),y(pts[1]));ctx.lineTo(x(pts[2]),y(pts[2]));
      ctx.closePath();
      if(red)ctx.fillStyle="rgba(241,49,76,.36)";
      else {
        const tone=Math.min(1,tri.light);
        ctx.fillStyle=`rgb(${Math.round(38+tone*59)},${Math.round(98+tone*81)},${Math.round(161+tone*75)})`;
      }
      ctx.fill();
    }
    const edges=mesh.edgeLines;
    ctx.strokeStyle=red?"rgba(255,102,123,.76)":"rgba(10,29,56,.8)";
    ctx.lineWidth=red?1.15:.75;
    for(let i=0;i+5<edges.length;i+=6){
      const a=project(edges[i],edges[i+1],edges[i+2]);
      const b=project(edges[i+3],edges[i+4],edges[i+5]);
      ctx.beginPath();ctx.moveTo(x(a),y(a));ctx.lineTo(x(b),y(b));ctx.stroke();
    }
  };
  fill(frame.mesh,false);
  if(cutter)fill(cutter,true);
  canvas.dataset.featureId=frame.featureId;
  canvas.dataset.operation=frame.operation;
  canvas.dataset.cutOverlay=cutter?"true":"false";
  canvas.dataset.resultVolumeMm3=String(frame.statistics.volumeMm3);
  if(frame.cutTool)canvas.dataset.toolVolumeMm3=String(frame.cutTool.statistics.volumeMm3);
}
