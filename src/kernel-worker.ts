/// <reference lib="webworker" />
import opencascade from "replicad-opencascadejs";
import wasmUrl from "replicad-opencascadejs/wasm?url";
import { setOC, sketchRectangle, sketchCircle, type Shape3D } from "replicad";
import { validateDocument, type Feature, type Profile } from "./model";
import type { KernelRequest, KernelResponse, GeometryMesh } from "./kernel-protocol";

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
  const planeConfig = { plane: "XY" as const };
  if (profile.kind === "rectangle") {
    const cx = profile.x + profile.width / 2;
    const cy = profile.y + profile.height / 2;
    return sketchRectangle(profile.width, profile.height, {
      ...planeConfig, origin: [cx, cy, feature.z]
    }).extrude(feature.depth);
  }
  return sketchCircle(profile.radius, {
    ...planeConfig, origin: [profile.x, profile.y, feature.z]
  }).extrude(feature.depth);
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
      worker.postMessage({ id: request.id, ok: true, action: "build", mesh: null } satisfies KernelResponse);
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
      const faces = solid.mesh({ tolerance: 0.08, angularTolerance: 0.2 });
      const edges = solid.meshEdges({ tolerance: 0.08, angularTolerance: 0.2 });
      const mesh: GeometryMesh = {
        vertices: faces.vertices,
        triangles: faces.triangles,
        normals: faces.normals,
        edgeLines: edges.lines
      };
      worker.postMessage({ id: request.id, ok: true, action: "build", mesh } satisfies KernelResponse);
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
