import type { CadDocument } from "./model";

export type GeometryMesh = {
  vertices: number[]; triangles: number[]; normals: number[]; edgeLines: number[];
};
export type KernelAction = "build" | "step";
export type KernelRequest = {
  id: number; action: KernelAction; document: CadDocument;
};
export type KernelResponse =
  | { id: number; ok: true; action: "build"; mesh: GeometryMesh | null }
  | { id: number; ok: true; action: "step"; blob: Blob }
  | { id: number; ok: false; message: string };
