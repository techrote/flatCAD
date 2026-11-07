import {describe,it,expect} from "vitest";
import {thumbnailBounds} from "./history-thumbnails";
import type {GeometryMesh} from "./kernel-protocol";
const mesh:GeometryMesh={
  vertices:[0,0,0,10,0,0,0,10,4],triangles:[0,1,2],normals:[],
  edgeLines:[0,0,0,10,0,0],topologyVertices:[0,0,0,10,0,0]
};
describe("B-rep-derived history thumbnail projection",()=>{
  it("calculates finite isometric fit bounds",()=>{
    const b=thumbnailBounds([mesh]);
    expect(b.maxU).toBeGreaterThan(b.minU);
    expect(b.maxV).toBeGreaterThan(b.minV);
  });
  it("includes out-of-body cutter overshoot in the projected thumbnail",()=>{
    const cutter:GeometryMesh={...mesh,vertices:[0,0,-5,10,0,0,0,10,12]};
    const bounds=thumbnailBounds([mesh,cutter]);
    expect(bounds.maxV-bounds.minV).toBeGreaterThan(
      thumbnailBounds([mesh]).maxV-thumbnailBounds([mesh]).minV);
  });
});
