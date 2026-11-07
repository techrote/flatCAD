import {describe,it,expect} from "vitest";
import {withoutCylinderSeams} from "./display-edges";
import {DEMO} from "./model";
import type {GeometryMesh} from "./kernel-protocol";
const mesh=(edgeLines:number[]):GeometryMesh=>({
  vertices:[],triangles:[],normals:[],topologyVertices:[],edgeLines
});
describe("display-only OCC cylinder seam filter",()=>{
  it("hides vertical periodic hole seam, preserves perimeter and arcs",()=>{
    const edges=[-30,0,-1,-30,0,9,-50,-30,0,-50,-30,8,
      -30,0,8,-25,0,8];
    const original=mesh(edges);
    const filtered=withoutCylinderSeams(original,DEMO)!;
    expect(filtered.edgeLines).toEqual(edges.slice(6));
    expect(original.edgeLines).toEqual(edges);
  });
  it("does not alter meshes with no cylindrical profiles",()=>{
    const noCircle={...DEMO,profiles:DEMO.profiles.filter(p=>p.kind!=="circle"),
      features:DEMO.features.filter(f=>f.operation!=="cut")};
    const input=mesh([5,0,0,5,0,8]);
    expect(withoutCylinderSeams(input,noCircle)).toBe(input);
  });
});
