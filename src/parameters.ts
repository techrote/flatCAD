/** Deterministic, eval-free numeric expressions for exact CAD values.
 *  Named definitions and binding formulas are document data. Numeric geometry
 *  fields remain materialized mm doubles for the OCC worker and legacy readers.
 */
import type {CadDocument,Profile,Feature} from "./model";
export type NamedParameter={name:string;expression:string};
export type ValueBinding={target:string;expression:string};
const nameRule=/^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
const NUMBER=/^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/;
export function isNumericLiteral(value:string):boolean{return NUMBER.test(value.trim());}
function bad(message:string):never{throw new Error("Invalid parametric expression: "+message);}
export function validateDefinitions(value:unknown):NamedParameter[]{
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>128)bad("parameters must be an array of at most 128");
  const known=new Set<string>();
  return value.map((p:unknown)=>{
    if(!p||typeof p!=="object"||Array.isArray(p))return bad("malformed parameter");
    const q=p as Record<string,unknown>;
    if(typeof q.name!=="string"||!nameRule.test(q.name)||q.name==="pi"||q.name==="e")
      bad("parameter name must be a valid identifier (pi/e reserved)");
    if(known.has(q.name))bad("duplicate parameter "+q.name);
    known.add(q.name);
    if(typeof q.expression!=="string"||!q.expression.trim()||q.expression.length>256)
      bad("parameter "+q.name+" requires a short expression");
    return {name:q.name,expression:q.expression.trim()};
  });
}
export function validateBindings(value:unknown):ValueBinding[]{
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>2000)bad("bindings must be an array of at most 2000");
  const seen=new Set<string>();
  return value.map((b:unknown)=>{
    if(!b||typeof b!=="object"||Array.isArray(b))bad("malformed binding");
    const q=b as Record<string,unknown>;
    if(typeof q.target!=="string"||q.target.length>128||
      !/^(profile|feature):[a-zA-Z0-9_-]{1,80}:[a-zA-Z0-9_.]+$/.test(q.target))
      bad("invalid expression target");
    if(seen.has(q.target))bad("duplicate expression target "+q.target);
    seen.add(q.target);
    if(typeof q.expression!=="string"||!q.expression.trim()||q.expression.length>256)
      bad("binding requires a short expression");
    return {target:q.target,expression:q.expression.trim()};
  });
}
type Token={kind:"number"|"name"|"op";text:string};
export function evaluateFormula(expression:string,resolve:(name:string)=>number):number{
  if(typeof expression!=="string"||!expression.trim()||expression.length>256)
    bad("expression is empty or too long");
  const tokens:Token[]=[];
  const matcher=/\s*(?:((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([()+\-*/^]))/y;
  const text=expression.trim();
  for(let offset=0;offset<text.length;){
    matcher.lastIndex=offset;
    const hit=matcher.exec(text);
    if(!hit||hit.index!==offset)bad("unsupported token near "+text.slice(offset,offset+12));
    tokens.push({kind:hit[1]?"number":hit[2]?"name":"op",
      text:hit[1]||hit[2]||hit[3]});
    if(tokens.length>128)bad("too many expression tokens");
    offset=matcher.lastIndex;
  }
  let i=0,depth=0;
  const current=()=>tokens[i];
  const check=(v:number):number=>{
    if(!Number.isFinite(v)||Math.abs(v)>1e15)bad("non-finite/overflow calculation");
    return v;
  };
  function parse(min=0):number{
    if(++depth>70)bad("expression nesting too deep");
    const start=tokens[i++];
    if(!start)bad("incomplete expression");
    let lhs:number;
    if(start.kind==="number")lhs=Number(start.text);
    else if(start.kind==="name"){
      lhs=start.text==="pi"?Math.PI:start.text==="e"?Math.E:resolve(start.text);
    }else if(start.text==="("){
      lhs=parse(0);
      if(current()?.text!==")")bad("missing closing parenthesis");
      i++;
    }else if(start.text==="+"||start.text==="-"){
      const unary=parse(3);
      lhs=start.text==="-"?-unary:unary;
    }else bad("unexpected operator "+start.text);
    lhs=check(lhs);
    while(i<tokens.length){
      const op=current();
      const priority=op?.text==="+"||op?.text==="-"?1:
        op?.text==="*"||op?.text==="/"?2:op?.text==="^"?3:0;
      if(!priority||priority<min)break;
      i++;
      const rhs=parse(priority+(op!.text==="^"?0:1));
      switch(op!.text){
        case "+":lhs+=rhs;break;
        case "-":lhs-=rhs;break;
        case "*":lhs*=rhs;break;
        case "/":if(rhs===0)bad("division by zero");lhs/=rhs;break;
        case "^":lhs=Math.pow(lhs,rhs);break;
      }
      lhs=check(lhs);
    }
    depth--;
    return lhs;
  }
  const answer=parse(0);
  if(i!==tokens.length)bad("trailing operator or expression");
  return check(answer);
}
export function resolveNamedParameters(definitions:readonly NamedParameter[]):Map<string,number>{
  const items=new Map(definitions.map(p=>[p.name,p.expression]));
  const cache=new Map<string,number>();
  const active=new Set<string>();
  const visit=(name:string):number=>{
    const cached=cache.get(name);
    if(cached!==undefined)return cached;
    const expr=items.get(name);
    if(expr===undefined)bad("unknown parameter "+name);
    if(active.has(name))bad("cyclic parameter dependency at "+name);
    active.add(name);
    try{
      const number=evaluateFormula(expr,visit);
      cache.set(name,number);return number;
    }finally{active.delete(name);}
  };
  for(const name of items.keys())visit(name);
  return cache;
}
export function numericExpression(expression:string,definitions:readonly NamedParameter[]):number{
  const values=resolveNamedParameters(definitions);
  return evaluateFormula(expression,name=>{
    const v=values.get(name);
    if(v===undefined)bad("unknown parameter "+name);
    return v;
  });
}
const PROFILE_FIELDS:Record<Profile["kind"],readonly string[]>={
  rectangle:["x","y","width","height","rotation"],circle:["x","y","radius"],
  polygon:["x","y","radius","rotation","sides"],
  slot:["x1","y1","x2","y2","radius"],path:[]
};
export function fieldValue(doc:CadDocument,target:string):number|null{
  const [kind,id,field,...extra]=target.split(":");
  if(extra.length)return null;
  if(kind==="feature"){
    if(field!=="z"&&field!=="depth")return null;
    const f=doc.features.find(x=>x.id===id);
    return f?f[field]:null;
  }
  if(kind!=="profile")return null;
  const p=doc.profiles.find(x=>x.id===id);
  if(!p)return null;
  if(p.kind==="path"){
    const match=/^points\.(\d+)\.(x|y)$/.exec(field);
    if(!match)return null;
    return p.points[Number(match[1])]?.[match[2] as "x"|"y"]??null;
  }
  if(!PROFILE_FIELDS[p.kind].includes(field))return null;
  if(p.kind==="rectangle"&&field==="rotation")return p.rotation??0;
  return (p as unknown as Record<string,number>)[field];
}
export function deriveBoundGeometry(doc:CadDocument):CadDocument{
  const definitions=validateDefinitions(doc.parameters);
  const bindings=validateBindings(doc.bindings);
  const scope=resolveNamedParameters(definitions);
  const profiles:Profile[]=doc.profiles.map(p=>p.kind==="path"?
    {...p,points:p.points.map(v=>({...v}))}:{...p});
  const features:Feature[]=doc.features.map(f=>({...f}));
  const output:CadDocument={...doc,profiles,features};
  for(const {target,expression} of bindings){
    const [kind,id,field]=target.split(":");
    if(fieldValue(output,target)===null)bad("missing/unsupported binding target "+target);
    const value=evaluateFormula(expression,name=>{
      const n=scope.get(name);
      if(n===undefined)bad("unknown parameter "+name);
      return n;
    });
    if(kind==="feature"){
      const f=features.find(x=>x.id===id)!;
      (f as unknown as Record<string,number>)[field]=value;
    }else{
      const p=profiles.find(x=>x.id===id)!;
      if(p.kind==="path"){
        const [,index,axis]=/^points\.(\d+)\.(x|y)$/.exec(field)!;
        p.points[Number(index)][axis as "x"|"y"]=value;
      }else (p as unknown as Record<string,number>)[field]=value;
    }
  }
  return {...output,...(doc.parameters?{parameters:definitions}:{}),
    ...(doc.bindings?{bindings}: {})};
}
/** Direct-manipulation overrides a bound scalar explicitly, preserving all
 * unaffected parameter bindings; undo can recover the original formula. */
export function unbindDirectEdits(before:CadDocument,after:CadDocument):CadDocument{
  if(!before.bindings?.length||JSON.stringify(before.parameters??[])!==JSON.stringify(after.parameters??[])||
    JSON.stringify(before.bindings)!==JSON.stringify(after.bindings??[]))return after;
  const bindings=before.bindings.filter(b=>{
    const was=fieldValue(before,b.target),now=fieldValue(after,b.target);
    return was===null||now===null||Math.abs(was-now)<1e-9;
  });
  return {...after,bindings};
}
export function renameParameterReferences(expression:string,oldName:string,newName:string):string{
  return expression.replace(/[A-Za-z_][A-Za-z0-9_]*/g,
    word=>word===oldName?newName:word);
}
