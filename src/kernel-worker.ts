/// <reference lib="webworker" />
import opencascade from "replicad-opencascadejs";
import wasmUrl from "replicad-opencascadejs/wasm?url";
import { Sketcher } from "replicad";
import { setOC, sketchRectangle, sketchCircle, measureVolume, type Shape3D } from "replicad";
import { polygonPoints } from "./geometry";
import { signedInterval } from "./signed-extrusion";
import { validateDocument, type Feature, type Profile } from "./model";
import type { KernelRequest, KernelResponse, GeometryMesh, KernelStatistics } from "./kernel-protocol";

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

function makeTool(profile: Profile, feature: Feature): Shape3D {
  // Preserve signed depth in source; normalize only for B-rep construction.
  const span = signedInterval(feature.z,feature.depth);
  const originZ=span.lower, height=span.height;
  const planeConfig = { plane: "XY" as const };
  if (profile.kind === "rectangle") {
    const cx = profile.x + profile.width / 2;
    const cy = profile.y + profile.height / 2;
    return sketchRectangle(profile.width, profile.height, {
      ...planeConfig, origin: [cx, cy, originZ]
    }).extrude(height);
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
function makeSolid(document: ReturnType<typeof validateDocument>): Shape3D | null {
  const profiles = new Map(document.profiles.map(p => [p.id, p]));
  let result: Shape3D | null = null;
  try {
    for (const feature of document.features) {
      const profile = profiles.get(feature.profileId);
      if (!profile) throw new Error("Missing profile: " + feature.profileId);
      const tool = makeTool(profile, feature);
      if (!result) {
        result = tool;
        continue;
      }
      try {
        const next: Shape3D = feature.operation === "add" ? result.fuse(tool) : result.cut(tool);
        result.delete();
        result = next;
      } finally {
        tool.delete();
      }
    }
    return result;
  } catch (error) {
    result?.delete();
    throw error;
  }
}

async function handle(request: KernelRequest): Promise<void> {
  try {
    const document = validateDocument(request.document);
    if (!document.features.length) {
      if (request.action === "step") throw new Error("Add an extrusion before exporting STEP");
      worker.postMessage({ id: request.id, ok: true, action: "build", mesh: null, statistics: null } satisfies KernelResponse);
      return;
    }
    await initialize();
    const solid = makeSolid(document);
    if (!solid) throw new Error("No solid created");
    try {
      if (request.action === "step") {
        const blob = solid.blobSTEP();
        worker.postMessage({ id: request.id, ok: true, action: "step", blob } satisfies KernelResponse);
        return;
      }
      const volumeMm3 = measureVolume(solid);
      const bbox = solid.boundingBox;
      const boundsMm = bbox.bounds;
      bbox.delete();
      if (!Number.isFinite(volumeMm3) || volumeMm3 <= 0) {
        throw new Error("B-rep solid has invalid or zero volume");
      }
      const statistics: KernelStatistics = { volumeMm3, boundsMm };
      const faces = solid.mesh({ tolerance: 0.08, angularTolerance: 0.2 });
      const edges = solid.meshEdges({ tolerance: 0.08, angularTolerance: 0.2 });
      const mesh: GeometryMesh = {
        vertices: faces.vertices,
        triangles: faces.triangles,
        normals: faces.normals,
        edgeLines: edges.lines
      };
      worker.postMessage({ id: request.id, ok: true, action: "build", mesh, statistics } satisfies KernelResponse);
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
