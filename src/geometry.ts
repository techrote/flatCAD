/** Pure 2D geometry. Coordinates are in millimetres, never screen pixels. */
import type { Point2, Profile, PolygonProfile, SlotProfile } from "./model";

const EPS=1e-9;
export function distance(a:Point2,b:Point2):number { return Math.hypot(a.x-b.x,a.y-b.y); }
export function polygonPoints(p:PolygonProfile):Point2[] {
  return Array.from({length:p.sides},(_,i)=>{
    const angle=(p.rotation+i*360/p.sides)*Math.PI/180;
    return {x:p.x+p.radius*Math.cos(angle),y:p.y+p.radius*Math.sin(angle)};
  });
}
export function slotPoints(p:SlotProfile,steps=16):Point2[] {
  const a={x:p.x1,y:p.y1},b={x:p.x2,y:p.y2};
  const dir=Math.atan2(b.y-a.y,b.x-a.x);
  const points:Point2[]=[];
  // Along the upper edge, round the far cap, along the lower edge and round the near cap.
  for(let i=0;i<=steps;i++) {
    const t=dir+Math.PI/2 - i*Math.PI/steps;
    points.push({x:b.x+p.radius*Math.cos(t),y:b.y+p.radius*Math.sin(t)});
  }
  for(let i=0;i<=steps;i++) {
    const t=dir-Math.PI/2 - i*Math.PI/steps;
    points.push({x:a.x+p.radius*Math.cos(t),y:a.y+p.radius*Math.sin(t)});
  }
  return points;
}
export function outline(p:Profile):Point2[] {
  switch(p.kind){
    case "rectangle": return [
      {x:p.x,y:p.y},{x:p.x+p.width,y:p.y},
      {x:p.x+p.width,y:p.y+p.height},{x:p.x,y:p.y+p.height}];
    case "circle": return Array.from({length:48},(_,i)=>{
      const a=i*Math.PI/24;return {x:p.x+p.radius*Math.cos(a),y:p.y+p.radius*Math.sin(a)};});
    case "polygon": return polygonPoints(p);
    case "slot": return slotPoints(p);
    case "path": return p.points;
  }
}
export function isClosed(p:Profile):boolean { return p.kind!=="path"||p.closed; }
export function signedArea(pts:Point2[]):number {
  return pts.reduce((sum,p,i)=>{const q=pts[(i+1)%pts.length];return sum+p.x*q.y-q.x*p.y;},0)/2;
}
function orientation(a:Point2,b:Point2,c:Point2):number {
  return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
}
function pointOnSegment(p:Point2,a:Point2,b:Point2):boolean {
  return Math.abs(orientation(a,b,p))<=EPS &&
    p.x>=Math.min(a.x,b.x)-EPS&&p.x<=Math.max(a.x,b.x)+EPS &&
    p.y>=Math.min(a.y,b.y)-EPS&&p.y<=Math.max(a.y,b.y)+EPS;
}
function segmentsIntersect(a:Point2,b:Point2,c:Point2,d:Point2):boolean {
  const abC=orientation(a,b,c),abD=orientation(a,b,d),cdA=orientation(c,d,a),cdB=orientation(c,d,b);
  if(((abC>EPS&&abD<-EPS)||(abC<-EPS&&abD>EPS)) &&
     ((cdA>EPS&&cdB<-EPS)||(cdA<-EPS&&cdB>EPS)))return true;
  return (Math.abs(abC)<=EPS&&pointOnSegment(c,a,b)) ||
    (Math.abs(abD)<=EPS&&pointOnSegment(d,a,b)) ||
    (Math.abs(cdA)<=EPS&&pointOnSegment(a,c,d)) ||
    (Math.abs(cdB)<=EPS&&pointOnSegment(b,c,d));
}
/** Strict simple planar polygon validation, rejecting duplicate edges and crossings. */
export function isSimplePolygon(points:Point2[]):boolean {
  const n=points.length;
  if(n<3||Math.abs(signedArea(points))<EPS)return false;
  for(let i=0;i<n;i++) {
    if(distance(points[i],points[(i+1)%n])<EPS)return false;
    for(let j=i+1;j<n;j++){
      if(j===i+1||(i===0&&j===n-1))continue;
      if(segmentsIntersect(points[i],points[(i+1)%n],points[j],points[(j+1)%n]))return false;
    }
  }
  return true;
}
export function pointSegmentDistance(p:Point2,a:Point2,b:Point2):number {
  const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy;
  if(d2<EPS*EPS)return distance(p,a);
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d2));
  return distance(p,{x:a.x+t*dx,y:a.y+t*dy});
}
export function contains(p:Profile,world:Point2):boolean {
  if(p.kind==="circle")return distance(world,{x:p.x,y:p.y})<=p.radius;
  if(p.kind==="rectangle")return world.x>=p.x&&world.x<=p.x+p.width&&world.y>=p.y&&world.y<=p.y+p.height;
  const vertices=outline(p);
  if(p.kind==="path"&&!p.closed)return false;
  let inside=false;
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
    const a=vertices[i],b=vertices[j];
    if((a.y>world.y)!==(b.y>world.y) &&
      world.x<(b.x-a.x)*(world.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
export function hit(p:Profile,world:Point2,tolerance:number):boolean {
  if(isClosed(p)&&contains(p,world))return true;
  const pts=outline(p);
  const count= p.kind==="path"&&!p.closed?pts.length-1:pts.length;
  return pts.some((v,i)=>i<count && pointSegmentDistance(world,v,pts[(i+1)%pts.length])<=tolerance);
}
export function centre(p:Profile):Point2 {
  if(p.kind==="rectangle")return {x:p.x+p.width/2,y:p.y+p.height/2};
  if(p.kind==="circle"||p.kind==="polygon")return {x:p.x,y:p.y};
  if(p.kind==="slot")return {x:(p.x1+p.x2)/2,y:(p.y1+p.y2)/2};
  return {x:p.points.reduce((s,v)=>s+v.x,0)/p.points.length,
          y:p.points.reduce((s,v)=>s+v.y,0)/p.points.length};
}
export function translate(p:Profile,dx:number,dy:number):Profile {
  switch(p.kind){
    case "rectangle":case "circle":case "polygon":return {...p,x:p.x+dx,y:p.y+dy};
    case "slot":return {...p,x1:p.x1+dx,y1:p.y1+dy,x2:p.x2+dx,y2:p.y2+dy};
    case "path":return {...p,points:p.points.map(v=>({x:v.x+dx,y:v.y+dy}))};
  }
}
export type Handle={name:string;point:Point2};
export function handles(p:Profile):Handle[] {
  switch(p.kind){
    case "rectangle":return outline(p).map((v,i)=>({name:"corner "+(i+1),point:v}));
    case "circle":return [{name:"radius",point:{x:p.x+p.radius,y:p.y}}];
    case "polygon":return [{name:"vertex / rotation",point:polygonPoints(p)[0]}];
    case "slot":{
      const dx=p.x2-p.x1,dy=p.y2-p.y1,scale=p.radius/Math.hypot(dx,dy);
      return [{name:"endpoint A",point:{x:p.x1,y:p.y1}},
        {name:"endpoint B",point:{x:p.x2,y:p.y2}},
        {name:"radius",point:{x:(p.x1+p.x2)/2-dy*scale,y:(p.y1+p.y2)/2+dx*scale}}];
    }
    case "path":return p.points.map((v,i)=>({name:"vertex "+(i+1),point:v}));
  }
}
export function moveHandle(p:Profile,index:number,to:Point2,shift=false):Profile {
  if(p.kind==="circle")return {...p,radius:distance({x:p.x,y:p.y},to)};
  if(p.kind==="polygon"){
    const dx=to.x-p.x,dy=to.y-p.y;
    const raw=Math.atan2(dy,dx)*180/Math.PI;
    return {...p,radius:Math.hypot(dx,dy),rotation:shift?Math.round(raw/15)*15:raw};
  }
  if(p.kind==="path"){
    return {...p,points:p.points.map((v,i)=>i===index?to:v)};
  }
  if(p.kind==="slot"){
    if(index===0)return {...p,x1:to.x,y1:to.y};
    if(index===1)return {...p,x2:to.x,y2:to.y};
    const dx=p.x2-p.x1,dy=p.y2-p.y1,length=Math.hypot(dx,dy);
    const centreX=(p.x1+p.x2)/2,centreY=(p.y1+p.y2)/2;
    const radius=Math.abs((-dy*(to.x-centreX)+dx*(to.y-centreY))/length);
    return {...p,radius};
  }
  const corners=outline(p);
  const opposite=corners[(index+2)%4];
  let dx=to.x-opposite.x,dy=to.y-opposite.y;
  if(shift){const size=Math.max(Math.abs(dx),Math.abs(dy));dx=Math.sign(dx||1)*size;dy=Math.sign(dy||1)*size;}
  return {...p,x:Math.min(opposite.x,opposite.x+dx),y:Math.min(opposite.y,opposite.y+dy),
    width:Math.abs(dx),height:Math.abs(dy)};
}
export function snapPoints(p:Profile):Point2[]{
  if(p.kind==="circle")return [{x:p.x,y:p.y},{x:p.x+p.radius,y:p.y},{x:p.x-p.radius,y:p.y},
    {x:p.x,y:p.y+p.radius},{x:p.x,y:p.y-p.radius}];
  if(p.kind==="slot")return [{x:p.x1,y:p.y1},{x:p.x2,y:p.y2},centre(p)];
  const pts=outline(p);
  const mids=pts.slice(0,p.kind==="path"&&!p.closed? -1:undefined).map((v,i)=>{
    const next=pts[(i+1)%pts.length];return {x:(v.x+next.x)/2,y:(v.y+next.y)/2};
  });
  return [...pts,...mids,centre(p)];
}
/** Conservative *suggestion* only: exact boolean behavior is always determined by the CAD kernel. */
export function suggestOperation(doc:{profiles:Profile[],features:{profileId:string,operation:string}[]},selected:Profile):"add"|"cut"{
  if(!isClosed(selected)||doc.features.length===0)return "add";
  const samples=outline(selected);
  return doc.features.some(f=>{
    const candidate=doc.profiles.find(p=>p.id===f.profileId);
    return f.operation==="add"&&candidate&&candidate.id!==selected.id &&
      samples.every(point=>contains(candidate,point));
  })?"cut":"add";
}
