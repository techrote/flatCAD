import { describe, expect, it } from "vitest";
import {
  DEMO, appendFeature, deleteProfile, updateProfile, validateDocument,
} from "./model";

const copy = () => JSON.parse(JSON.stringify(DEMO));

describe("schema v1 validation", () => {
  it("accepts and preserves a demo solid description", () => {
    const doc = validateDocument(copy());
    expect(doc.profiles).toHaveLength(3);
    expect(doc.features.map(f => f.operation)).toEqual(["add", "cut", "cut"]);
    expect(doc.units).toBe("mm");
    expect(doc.schemaVersion).toBe(2);
  });
  it.each([
    ["wrong version", (x: any) => x.schemaVersion = 99],
    ["wrong units", (x: any) => x.units = "inch"],
    ["non-finite width", (x: any) => x.profiles[0].width = Infinity],
    ["zero width", (x: any) => x.profiles[0].width = 0],
    ["NaN origin", (x: any) => x.profiles[0].x = NaN],
    ["duplicate IDs", (x: any) => x.profiles[1].id = "plate"],
    ["missing referenced profile", (x: any) => x.features[1].profileId = "missing"],
    ["cut-first history", (x: any) => x.features[0].operation = "cut"],
    ["zero depth", (x: any) => x.features[0].depth = 0],
    ["non-finite depth", (x: any) => x.features[0].depth = Infinity],
    ["unsupported profile", (x: any) => x.profiles[0].kind = "polygon"],
  ])("rejects %s", (_name, mutate) => {
    const doc = copy();
    mutate(doc);
    expect(() => validateDocument(doc)).toThrow("Invalid flatCAD document");
  });
  it("updating profile retains feature IDs and dimension precision", () => {
    const doc = updateProfile(DEMO, { ...DEMO.profiles[0], width: 101.125 } as typeof DEMO.profiles[0]);
    expect(doc.features).toEqual(DEMO.features);
    expect((doc.profiles[0] as any).width).toBe(101.125);
    expect((DEMO.profiles[0] as any).width).toBe(100);
  });
  it("deleting a profile explicitly removes its dependent features", () => {
    const doc = deleteProfile(DEMO, "hole_l");
    expect(doc.profiles).toHaveLength(2);
    expect(doc.features.map(f => f.id)).toEqual(["base", "cut_r"]);
  });
  it("never admits cut-only history", () => {
    const doc = validateDocument({
      ...DEMO, features: []
    });
    expect(() => appendFeature(doc, {
      id: "cut", profileId: "hole_l", operation: "cut", z: 0, depth: 10
    })).toThrow("first feature");
  });
});

describe("extended authoring schema",()=>{
  it("migrates old native v1 documents to v2 without geometry loss",()=>{
    const migrated=validateDocument({...DEMO,schemaVersion:1});
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.features).toEqual(DEMO.features);
  });
  it("accepts editable regular polygons, slots and closed paths",()=>{
    const profiles=[
      {id:"p",kind:"polygon",x:0,y:0,radius:10,sides:6,rotation:30},
      {id:"s",kind:"slot",x1:0,y1:0,x2:20,y2:0,radius:3},
      {id:"line",kind:"path",points:[{x:0,y:0},{x:10,y:0},{x:10,y:10}],closed:true}
    ];
    const doc=validateDocument({schemaVersion:2,name:"New",units:"mm",profiles,
      features:[{id:"f",profileId:"p",operation:"add",z:0,depth:8}]});
    expect(doc.profiles).toHaveLength(3);
  });
  it("rejects extrusions of open geometry",()=>{
    const input={schemaVersion:2,name:"Open",units:"mm",
      profiles:[{id:"l",kind:"path",points:[{x:0,y:0},{x:2,y:2}],closed:false}],
      features:[{id:"x",profileId:"l",operation:"add",z:0,depth:8}]};
    expect(()=>validateDocument(input)).toThrow("missing referenced profile");
  });
  it("rejects intersecting or degenerate closed profiles",()=>{
    expect(()=>validateDocument({schemaVersion:2,name:"Broken",units:"mm",
      profiles:[{id:"l",kind:"path",points:[{x:0,y:0},{x:5,y:5},{x:0,y:5},{x:5,y:0}],closed:true}],
      features:[]})).toThrow("invalid closed polygon path");
  });
});

describe("signed feature depth and document compatibility",()=>{
  it("stores opposite-direction cut without losing signed depth",()=>{
    const p=validateDocument({...DEMO,features:[...DEMO.features,
      {id:"reverseCut",profileId:"hole_l",operation:"cut",z:8,depth:-6}]});
    expect(p.features.at(-1)).toEqual({
      id:"reverseCut",profileId:"hole_l",operation:"cut",z:8,depth:-6
    });
    expect(validateDocument(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it("loads positive v1/v2 features unchanged",()=>{
    expect(validateDocument({...DEMO,schemaVersion:1}).features).toEqual(DEMO.features);
    expect(validateDocument(DEMO).features[0].depth).toBe(8);
  });
});

describe("rotated rectangles retain valid v2 parametric geometry",()=>{
  it("round-trips an authored rotation and preserves legacy absence",()=>{
    const older=validateDocument(DEMO);
    expect("rotation" in older.profiles[0]).toBe(false);
    const rotated=validateDocument({...DEMO,profiles:DEMO.profiles.map((p,i)=>
      i===0?{...p,rotation:22.5}:p)});
    expect((rotated.profiles[0] as any).rotation).toBe(22.5);
    expect(validateDocument(JSON.parse(JSON.stringify(rotated)))).toEqual(rotated);
    expect(()=>validateDocument({...DEMO,profiles:DEMO.profiles.map((p,i)=>
      i===0?{...p,rotation:Infinity}:p)})).toThrow("rotation");
  });
});
