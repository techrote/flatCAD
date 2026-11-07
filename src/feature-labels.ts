import type { CadDocument, Feature, Profile } from "./model";

const KIND_NAMES:Record<Profile["kind"],string>={
  rectangle:"Rectangle",circle:"Circle",polygon:"Polygon",
  path:"Polyline",slot:"Slot",
};
/** Human-readable, deterministic names from the operation and its sketch. */
export function featureLabel(doc:CadDocument,feature:Feature):string{
  const profile=doc.profiles.find(p=>p.id===feature.profileId);
  if(!profile)return (feature.operation==="cut"?"Cut":"Extrude")+" · Missing sketch";
  const ordinal=doc.profiles.filter(p=>p.kind===profile.kind)
    .findIndex(p=>p.id===profile.id)+1;
  const base=(feature.operation==="cut"?"Cut":"Extrude")+
    " · "+KIND_NAMES[profile.kind]+" "+ordinal;
  const identical=doc.features.filter(f=>f.profileId===feature.profileId&&
    f.operation===feature.operation);
  const occurrence=identical.findIndex(f=>f.id===feature.id);
  return identical.length>1&&occurrence>0?base+" ("+(occurrence+1)+")":base;
}
export function featureExtentLabel(f:Feature):string{
  const end=f.z+f.depth;
  const depth=f.depth>0?"+"+f.depth:f.depth.toString();
  const advanced=[
    (f.tiltX??0)!==0?"X "+f.tiltX+"°":"",
    (f.tiltY??0)!==0?"Y "+f.tiltY+"°":"",
    (f.twist??0)!==0?"Twist "+f.twist+"°":""
  ].filter(Boolean).join(" · ");
  return "Z "+f.z+" → "+end+" mm · Δ"+depth+" mm"+
    (advanced?" · "+advanced:"");
}
