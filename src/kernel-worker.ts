/// <reference lib="webworker" />
import opencascade from "replicad-opencascadejs";
import wasmUrl from "replicad-opencascadejs/wasm?url";
import { Sketcher } from "replicad";
import { setOC, sketchRectangle, sketchCircle, measureVolume, type Shape3D } from "replicad";
import { polygonPoints, outline, centre, rotatePoint } from "./geometry";
import { signedInterval } from "./signed-extrusion";
import { validateDocument, type Feature, type Profile } from "./model";
import type { KernelRequest, KernelResponse, GeometryMesh, KernelStatistics,
  PreviewTool, KernelHistoryFrame } from "./kernel-protocol";

const worker = self as DedicatedWorkerGlobalScope;
let initializePromise: Promise<void> | null = null;

function initialize(): Promise<void> {
  if (!initializePromise) {
    initializePromise = opencascade({ locateFile: () => wasmUrl }).then(oc => {
      setOC(oc);
    }).catch(error => {
      initializePromise = null;
      throw error;
    });
  }
  return initializePromise;
}

/** Advanced Z-progression remains anchored to the fixed authored XY plane.
 *  Tilt translates each XY section as height increases, rather than tilting
 *  the sketch plane. Twist rotates sections about their authored centroid.
 *  Both are kernel B-reps, not mesh approximations.
 */
function makeDirectedTool(profile:Profile,feature:Feature):Shape3D{
  const span=signedInterval(feature.z,feature.depth);
  const height=span.height,sign=feature.depth>=0?1:-1;
  const dx=Math.tan((feature.tiltX??0)*Math.PI/180);
  const dy=Math.tan((feature.tiltY??0)*Math.PI/180);
  const twist=feature.twist??0;
  const pivot=centre(profile);
  // Negative signed depth is authored from the high plane downwards. The
  // worker constructs bottom → top, so its bottom section is displaced or
  // pre-rotated to yield the exact authored start/end positions.
  const startX=sign<0?dx*height:0,startY=sign<0?dy*height:0;
  const baseTwist=sign<0?twist:0;
  const lower=span.lower;
  const origin:[number,number,number]=[pivot.x+startX,pivot.y+startY,lower];
  const direction=sign<0?[-dx,-dy,1] as [number,number,number]:
    [dx,dy,1] as [number,number,number];
  const distance=height*Math.hypot(direction[0],direction[1],1);
  const config:{
    extrusionDirection?:[number,number,number];
    twistAngle?:number;
    origin?:[number,number,number];
  }={};
  if(dx!==0||dy!==0)config.extrusionDirection=direction;
  if(twist!==0){
    config.twistAngle=sign*twist;
    config.origin=origin;
  }
  if(profile.kind==="circle"){
    // Twisting a circular section about its own centre is geometrically
    // invariant; do not invoke a high-cost periodic B-rep sweep unnecessarily.
    return sketchCircle(profile.radius,{plane:"XY",origin}).extrude(distance,
      twist===0?config:{});
  }
  const transformed=(p:{x:number;y:number}):[number,number]=>{
    const q=baseTwist?rotatePoint(p,pivot,baseTwist):p;
    return [q.x-pivot.x,q.y-pivot.y];
  };
  const sketch=new Sketcher("XY",origin);
  if(profile.kind==="slot"){
    const x=profile.x2-profile.x1,y=profile.y2-profile.y1;
    const length=Math.hypot(x,y),px=-y/length*profile.radius,py=x/length*profile.radius;
    const p0=transformed({x:profile.x1+px,y:profile.y1+py});
    const p1=transformed({x:profile.x2+px,y:profile.y2+py});
    const p2=transformed({x:profile.x2-px,y:profile.y2-py});
    const p3=transformed({x:profile.x1-px,y:profile.y1-py});
    return sketch.movePointerTo(p0).lineTo(p1)
      .sagittaArcTo(p2,-profile.radius)
      .lineTo(p3).sagittaArcTo(p0,-profile.radius)
      .done().extrude(distance,config);
  }
  if(profile.kind==="path"&&!profile.closed)
    throw new Error("Cannot extrude an open polyline");
  const points=outline(profile);
  sketch.movePointerTo(transformed(points[0]));
  for(const p of points.slice(1))sketch.lineTo(transformed(p));
  return sketch.close().extrude(distance,config);
}

function makeTool(profile: Profile, feature: Feature): Shape3D {
  if((feature.tiltX??0)!==0||(feature.tiltY??0)!==0||
    (feature.twist??0)!==0)return makeDirectedTool(profile,feature);
  // Preserve signed depth in source; normalize only for B-rep construction.
  const span = signedInterval(feature.z,feature.depth);
  const originZ=span.lower, height=span.height;
  const planeConfig = { plane: "XY" as const };
  if (profile.kind === "rectangle") {
    const cx = profile.x + profile.width / 2;
    const cy = profile.y + profile.height / 2;
    if(!profile.rotation)return sketchRectangle(profile.width, profile.height,{
      ...planeConfig,origin:[cx,cy,originZ]
    }).extrude(height);
    const corners=outline(profile);
    const rotated=new Sketcher("XY",[0,0,originZ])
      .movePointerTo([corners[0].x,corners[0].y]);
    for(const point of corners.slice(1))rotated.lineTo([point.x,point.y]);
    return rotated.close().extrude(height);
  }
  if (profile.kind === "circle") {
    return sketchCircle(profile.radius, {
      ...planeConfig, origin: [profile.x, profile.y, originZ]
    }).extrude(height);
  }
  if (profile.kind === "path" && !profile.closed) {
    throw new Error("Open lines cannot be extruded: close the path first");
  }
  if (profile.kind === "slot") {
    const dx = profile.x2 - profile.x1;
    const dy = profile.y2 - profile.y1;
    const length = Math.hypot(dx, dy);
    const px = -dy / length * profile.radius;
    const py = dx / length * profile.radius;
    const p0: [number, number] = [profile.x1 + px, profile.y1 + py];
    const p1: [number, number] = [profile.x2 + px, profile.y2 + py];
    const p2: [number, number] = [profile.x2 - px, profile.y2 - py];
    const p3: [number, number] = [profile.x1 - px, profile.y1 - py];
    // A closed wire with two exact circular semicircles, not a tessellated polygon.
    return new Sketcher("XY", [0, 0, originZ])
      .movePointerTo(p0).lineTo(p1).sagittaArcTo(p2, -profile.radius)
      .lineTo(p3).sagittaArcTo(p0, -profile.radius).done()
      .extrude(height);
  }
  const points = profile.kind === "polygon" ? polygonPoints(profile) : profile.points;
  const sketch = new Sketcher("XY", [0, 0, originZ])
    .movePointerTo([points[0].x, points[0].y]);
  for (const point of points.slice(1)) sketch.lineTo([point.x, point.y]);
  return sketch.close().extrude(height);
}

/** Evaluate features from source parameters, never from the display triangle mesh. */
/** One exact replay, optionally retaining B-rep-derived states after each feature. */
function makeSolid(
  document: ReturnType<typeof validateDocument>,
  frames?:KernelHistoryFrame[]
): Shape3D | null {
  const profiles=new Map(document.profiles.map(p=>[p.id,p]));
  let result:Shape3D|null=null;
  try{
    for(const feature of document.features){
      const profile=profiles.get(feature.profileId);
      if(!profile)throw new Error("Missing profile: "+feature.profileId);
      const tool=makeTool(profile,feature);
      let cutSnapshot:PreviewTool|null=null;
      if(frames&&feature.operation==="cut"){
        cutSnapshot=measureAndMesh(tool);
      }
      if(!result){
        result=tool;
      }else{
        try{
          const next:Shape3D=feature.operation==="add"?result.fuse(tool):result.cut(tool);
          result.delete();
          result=next;
        }finally{tool.delete();}
      }
      if(frames&&result){
        const snapshot=measureAndMesh(result);
        frames.push({featureId:feature.id,operation:feature.operation,
          mesh:snapshot.mesh,statistics:snapshot.statistics,cutTool:cutSnapshot});
      }
    }
    return result;
  }catch(error){
    result?.delete();
    throw error;
  }
}

function measureAndMesh(solid:Shape3D):{mesh:GeometryMesh,statistics:KernelStatistics}{
  const volumeMm3=measureVolume(solid);
  const bbox=solid.boundingBox;
  const boundsMm=bbox.bounds;
  bbox.delete();
  if(!Number.isFinite(volumeMm3)||volumeMm3<=0)
    throw new Error("B-rep solid has invalid or zero volume");
  // Only actual B-rep edge endpoints qualify as interactive vertices.
  // The triangulation's interior corners must not masquerade as CAD vertices.
  const topologyVertices:number[]=[];
  const seen=new Set<string>();
  const topologyEdges=solid.edges;
  try{
    for(const edge of topologyEdges){
      const ends=[edge.startPoint,edge.endPoint];
      for(const point of ends){
        try{
          const x=point.x,y=point.y,z=point.z;
          const key=[x,y,z].map(v=>Math.round(v*1e6)).join("/");
          if(!seen.has(key)){
            seen.add(key);topologyVertices.push(x,y,z);
          }
        }finally{point.delete();}
      }
    }
  }finally{
    for(const edge of topologyEdges)edge.delete();
  }
  const faces=solid.mesh({tolerance:.08,angularTolerance:.2});
  const edges=solid.meshEdges({tolerance:.08,angularTolerance:.2});
  return {statistics:{volumeMm3,boundsMm},mesh:{
    vertices:faces.vertices,triangles:faces.triangles,
    normals:faces.normals,edgeLines:edges.lines,topologyVertices
  }};
}

/** The cutting tool is a separate exact B-rep before Boolean intersection.
 *  Its full Z range is retained, including overshoot outside the base solid. */
function makeCutTool(
  doc:ReturnType<typeof validateDocument>, ids:readonly string[]
):PreviewTool|null{
  if(!ids.length)return null;
  if(new Set(ids).size!==ids.length)throw new Error("Duplicate cut-tool feature ID");
  const chosen=ids.map(id=>doc.features.find(f=>f.id===id));
  if(chosen.some(f=>!f||f.operation!=="cut"))
    throw new Error("Cut preview references unknown or non-cut feature");
  const toolDoc={...doc,features:(chosen as Feature[]).map(f=>({...f,operation:"add" as const}))};
  const tool=makeSolid(toolDoc);
  if(!tool)throw new Error("No cut-tool geometry");
  try{return measureAndMesh(tool);}finally{tool.delete();}
}

async function handle(request: KernelRequest): Promise<void> {
  try {
    const document = validateDocument(request.document);
    if (!document.features.length) {
      if (request.action === "step") throw new Error("Add an extrusion before exporting STEP");
      worker.postMessage({ id: request.id, ok: true, action: "build", mesh: null, statistics: null, cutTool: null,
        historyFrames:[] } satisfies KernelResponse);
      return;
    }
    await initialize();
    const historyFrames:KernelHistoryFrame[]=[];
    const solid = makeSolid(document,request.includeHistory?historyFrames:undefined);
    if (!solid) throw new Error("No solid created");
    try {
      if (request.action === "step") {
        const blob = solid.blobSTEP();
        worker.postMessage({ id: request.id, ok: true, action: "step", blob } satisfies KernelResponse);
        return;
      }
      const snapshot=historyFrames.at(-1);
      const {mesh,statistics}=snapshot
        ? {mesh:snapshot.mesh,statistics:snapshot.statistics}
        : measureAndMesh(solid);
      const cutTool=makeCutTool(document,request.cutToolFeatureIds??[]);
      worker.postMessage({
        id:request.id,ok:true,action:"build",mesh,statistics,cutTool,historyFrames
      } satisfies KernelResponse);
    } finally {
      solid.delete();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    worker.postMessage({ id: request.id, ok: false, message } satisfies KernelResponse);
  }
}

// Sequence async work explicitly. Concurrent WASM boolean operations on one runtime are unsafe.
let queue = Promise.resolve();
worker.onmessage = (event: MessageEvent<KernelRequest>) => {
  const request = event.data;
  queue = queue.then(() => handle(request)).catch(error => {
    worker.postMessage({ id: request.id, ok: false, message: String(error) } satisfies KernelResponse);
  });
};
