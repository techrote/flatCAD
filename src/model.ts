/** Physical millimetres; never canvas pixels. Schema v2 accepts v1 migration. */
import { isSimplePolygon, signedArea } from "./geometry";
export type Point2 = { x: number; y: number };
export type Rectangle = { id:string; kind:"rectangle"; x:number; y:number; width:number; height:number };
export type Circle = { id:string; kind:"circle"; x:number; y:number; radius:number };
export type PolygonProfile = { id:string; kind:"polygon"; x:number; y:number; radius:number; sides:number; rotation:number };
export type PathProfile = { id:string; kind:"path"; points:Point2[]; closed:boolean };
export type SlotProfile = { id:string; kind:"slot"; x1:number; y1:number; x2:number; y2:number; radius:number };
export type Profile = Rectangle | Circle | PolygonProfile | PathProfile | SlotProfile;
export type Feature = { id:string; profileId:string; operation:"add"|"cut"; z:number; depth:number };
export type CadDocument = { schemaVersion:2; name:string; units:"mm"; profiles:Profile[]; features:Feature[] };

const LIMIT = 1_000_000;
function failUnless(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("Invalid flatCAD document: " + message);
}
function record(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}
function positive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 && x <= LIMIT;
}
function coordinate(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= LIMIT;
}
function identifier(x: unknown): x is string {
  return typeof x === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(x);
}

export function validateDocument(input: unknown): CadDocument {
  failUnless(record(input), "root must be an object");
  failUnless(input.schemaVersion === 1 || input.schemaVersion === 2, "unsupported schema version");
  failUnless(input.units === "mm", "only mm units supported");
  failUnless(typeof input.name === "string" && input.name.length > 0 && input.name.length < 129, "name required (up to 128 characters)");
  failUnless(Array.isArray(input.profiles) && input.profiles.length <= 1000, "profiles must be an array of at most 1000");
  failUnless(Array.isArray(input.features) && input.features.length <= 1000, "features must be an array of at most 1000");
  const ids = new Set<string>();
  const profiles: Profile[] = input.profiles.map((p: unknown) => {
    failUnless(record(p) && identifier(p.id) && !ids.has(p.id), "invalid/duplicate profile ID");
    ids.add(p.id);
    if (p.kind === "rectangle") {
      failUnless(coordinate(p.x)&&coordinate(p.y),"invalid rectangle coordinates");
      failUnless(positive(p.width) && positive(p.height), "invalid rectangle dimensions");
      failUnless(Math.abs(p.x + p.width) <= LIMIT && Math.abs(p.y + p.height) <= LIMIT, "rectangle outside extent");
      return { kind: "rectangle", id: p.id, x: p.x, y: p.y, width: p.width, height: p.height };
    }
    if (p.kind === "circle") {
      failUnless(coordinate(p.x)&&coordinate(p.y),"invalid circle coordinates");
      failUnless(positive(p.radius), "invalid circle radius");
      failUnless(Math.abs(p.x) + p.radius <= LIMIT && Math.abs(p.y) + p.radius <= LIMIT, "circle outside extent");
      return { kind: "circle", id: p.id, x: p.x, y: p.y, radius: p.radius };
    }

    failUnless(input.schemaVersion===2,"older project schemas cannot contain extended geometry");
    if(p.kind==="polygon"){
      failUnless(coordinate(p.x)&&coordinate(p.y)&&positive(p.radius)&&coordinate(p.rotation),
        "invalid polygon coordinates or radius");
      failUnless(typeof p.sides==="number"&&Number.isInteger(p.sides)&&p.sides>=3&&p.sides<=64,
        "polygon sides must be an integer from 3 to 64");
      failUnless(Math.abs(p.x)+p.radius<=LIMIT&&Math.abs(p.y)+p.radius<=LIMIT,"polygon outside extent");
      return {kind:"polygon",id:p.id,x:p.x,y:p.y,radius:p.radius,sides:p.sides,rotation:p.rotation};
    }
    if(p.kind==="slot"){
      failUnless(coordinate(p.x1)&&coordinate(p.y1)&&coordinate(p.x2)&&coordinate(p.y2)&&
        positive(p.radius),"invalid slot parameters");
      failUnless(Math.hypot(p.x2-p.x1,p.y2-p.y1)>1e-9,"slot endpoints cannot coincide");
      failUnless([p.x1,p.y1,p.x2,p.y2].every(v=>Math.abs(v)+p.radius<=LIMIT),"slot outside extent");
      return {kind:"slot",id:p.id,x1:p.x1,y1:p.y1,x2:p.x2,y2:p.y2,radius:p.radius};
    }
    if(p.kind==="path"){
      failUnless(Array.isArray(p.points)&&p.points.length>=2&&p.points.length<=256&&
        typeof p.closed==="boolean","invalid line/path vertices");
      const points:Point2[]=p.points.map((v:unknown)=>{
        failUnless(record(v)&&coordinate(v.x)&&coordinate(v.y),"invalid path coordinate");
        return {x:v.x,y:v.y};
      });
      failUnless(points.every((v,i)=>i===0||Math.hypot(v.x-points[i-1].x,v.y-points[i-1].y)>1e-9),
        "zero-length path segment");
      if(p.closed)failUnless(isSimplePolygon(points)&&Math.abs(signedArea(points))>1e-9,"invalid closed polygon path");
      return {kind:"path",id:p.id,points,closed:p.closed};
    }
    throw new Error("Invalid flatCAD document: unsupported profile kind");
  });
  const profileIds = new Set(profiles.filter(p=>p.kind!=="path"||p.closed).map(p => p.id));
  const featureIds = new Set<string>();
  const features: Feature[] = input.features.map((f: unknown, index: number) => {
    failUnless(record(f) && identifier(f.id) && !featureIds.has(f.id) && !profileIds.has(f.id), "invalid/duplicate feature ID");
    featureIds.add(f.id);
    failUnless(typeof f.profileId === "string" && profileIds.has(f.profileId), "missing referenced profile");
    failUnless(f.operation === "add" || f.operation === "cut", "unsupported feature operation");
    failUnless(index !== 0 || f.operation === "add", "first feature must add material");
    failUnless(coordinate(f.z) && positive(f.depth) && Math.abs(f.z + f.depth) <= LIMIT, "invalid feature Z/depth");
    return { id: f.id, profileId: f.profileId, operation: f.operation, z: f.z, depth: f.depth };
  });
  return { schemaVersion: 2, name: input.name, units: "mm", profiles, features };
}

export const DEMO: CadDocument = validateDocument({
  schemaVersion: 2, name: "Mounting plate", units: "mm",
  profiles: [
    { id: "plate", kind: "rectangle", x: -50, y: -30, width: 100, height: 60 },
    { id: "hole_l", kind: "circle", x: -35, y: 0, radius: 5 },
    { id: "hole_r", kind: "circle", x: 35, y: 0, radius: 5 }
  ],
  features: [
    { id: "base", profileId: "plate", operation: "add", z: 0, depth: 8 },
    { id: "cut_l", profileId: "hole_l", operation: "cut", z: -1, depth: 10 },
    { id: "cut_r", profileId: "hole_r", operation: "cut", z: -1, depth: 10 }
  ]
});

export function appendProfile(doc: CadDocument, profile: Profile): CadDocument {
  return validateDocument({ ...doc, profiles: [...doc.profiles, profile] });
}
export function updateProfile(doc: CadDocument, profile: Profile): CadDocument {
  return validateDocument({ ...doc, profiles: doc.profiles.map(p => p.id === profile.id ? profile : p) });
}
export function deleteProfile(doc: CadDocument, id: string): CadDocument {
  return validateDocument({
    ...doc, profiles: doc.profiles.filter(p => p.id !== id),
    features: doc.features.filter(f => f.profileId !== id)
  });
}
export function appendFeature(doc: CadDocument, feature: Feature): CadDocument {
  return validateDocument({ ...doc, features: [...doc.features, feature] });
}
export function newId(prefix: string): string {
  return prefix + "_" + crypto.randomUUID().replaceAll("-", "");
}
