import type { CadDocument } from "./model";

export type GeometryMesh = {
  vertices: number[]; triangles: number[]; normals: number[]; edgeLines: number[];
  /** Exact OCCT edge endpoints, not tessellation vertices, [x,y,z,...]. */
  topologyVertices: number[];
};
export type KernelStatistics = {
  volumeMm3: number;
  boundsMm: [[number, number, number], [number, number, number]];
};
export type PreviewTool = {mesh:GeometryMesh, statistics:KernelStatistics};
export type KernelHistoryFrame = {
  featureId:string; operation:"add"|"cut"; mesh:GeometryMesh;
  statistics:KernelStatistics; cutTool:PreviewTool|null;
};
export type KernelBuild = {
  mesh: GeometryMesh | null; statistics: KernelStatistics | null;
  cutTool: PreviewTool | null; historyFrames:KernelHistoryFrame[];
};
export type KernelAction = "build" | "step";
export type KernelRequest = {
  id: number; action: KernelAction; document: CadDocument;
  cutToolFeatureIds?:string[];
  includeHistory?:boolean;
};
export type KernelResponse =
  | { id: number; ok: true; action: "build"; mesh: GeometryMesh | null;
      statistics: KernelStatistics | null; cutTool: PreviewTool | null;
      historyFrames:KernelHistoryFrame[] }
  | { id: number; ok: true; action: "step"; blob: Blob }
  | { id: number; ok: false; message: string };
