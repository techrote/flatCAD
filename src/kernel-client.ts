import type { CadDocument } from "./model";
import type { KernelBuild, KernelAction, KernelRequest, KernelResponse } from "./kernel-protocol";

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void };

export class KernelClient {
  private readonly worker = new Worker(new URL("./kernel-worker.ts", import.meta.url), { type: "module" });
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<KernelResponse>) => {
      const entry = this.pending.get(data.id);
      if (!entry) return;
      this.pending.delete(data.id);
      if (!data.ok) entry.reject(new Error(data.message));
      else entry.resolve(data.action === "build" ? { mesh: data.mesh, statistics: data.statistics, cutTool: data.cutTool } : data.blob);
    };
    this.worker.onerror = event => {
      const error = new Error(event.message || "CAD worker failed");
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    };
  }

  private request<T>(action: KernelAction, document: CadDocument,cutToolFeatureIds?:string[]): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const message: KernelRequest = { id, action, document, cutToolFeatureIds };
      this.worker.postMessage(message);
    });
  }

  build(document: CadDocument,options:{cutToolFeatureIds?:string[]}={}): Promise<KernelBuild> {
    return this.request("build", document,options.cutToolFeatureIds);
  }

  exportSTEP(document: CadDocument): Promise<Blob> {
    return this.request("step", document);
  }

  dispose(): void {
    this.worker.terminate();
    for (const item of this.pending.values()) item.reject(new Error("CAD kernel closed"));
    this.pending.clear();
  }
}
