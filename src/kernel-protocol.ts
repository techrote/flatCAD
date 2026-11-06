import type { CadDocument } from "./model";

export type GeometryMesh = {
  vertices: number[]; triangles: number[]; normals: number[]; edgeLines: number[];
};
export type KernelStatistics = {
  volumeMm3: number;
  boundsMm: [[number, number, number], [number, number, number]];
};
export type KernelBuild = { mesh: GeometryMesh | null; statistics: KernelStatistics | null };
export type KernelAction = "build" | "step";
export type KernelRequest = {
  id: number; action: KernelAction; document: CadDocument;
};
export type KernelResponse =
  | { id: number; ok: true; action: "build"; mesh: GeometryMesh | null; statistics: KernelStatistics | null }
  | { id: number; ok: true; action: "step"; blob: Blob }
  | { id: number; ok: false; message: string };
