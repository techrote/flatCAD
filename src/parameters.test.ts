import {describe,it,expect} from "vitest";
import {DEMO,validateDocument} from "./model";
import {evaluateFormula,numericExpression,resolveNamedParameters,
  renameParameterReferences} from "./parameters";
describe("exact document named-parameter expressions",()=>{
  const paramDoc=()=>validateDocument({...DEMO,
    parameters:[{name:"width",expression:"120"},{name:"pitch",expression:"width / 2"},
      {name:"thickness",expression:"(pitch / 10) + 2"}],
    bindings:[{target:"profile:plate:width",expression:"width"},
      {target:"feature:base:depth",expression:"thickness"}]});
  it("evaluates chained parameters and updates exact native numbers",()=>{
    const model=paramDoc();
    expect((model.profiles[0] as any).width).toBe(120);
    expect(model.features[0].depth).toBe(8);
    expect(numericExpression("pitch/2+pi*0",model.parameters!)).toBe(30);
    expect(validateDocument(JSON.parse(JSON.stringify(model)))).toEqual(model);
    const edited=validateDocument({...model,
      parameters:model.parameters!.map(p=>p.name==="width"?{...p,expression:"140"}:p)});
    expect((edited.profiles[0] as any).width).toBe(140);
    expect(edited.features[0].depth).toBe(9);
  });
  it("rejects cycles, injections, divisions by zero and bad targets",()=>{
    expect(()=>numericExpression("foo()",[{name:"foo",expression:"10"}])).toThrow();
    expect(()=>numericExpression("1/0",[])).toThrow("division by zero");
    expect(()=>numericExpression("A",[{name:"A",expression:"B"},{name:"B",expression:"A"}]))
      .toThrow("cyclic");
    expect(()=>validateDocument({...DEMO,bindings:[{target:"profile:plate:oops",expression:"1"}]}))
      .toThrow("target");
    expect(()=>validateDocument({...DEMO,bindings:[{target:"feature:base:depth",expression:"0"}]}))
      .toThrow("invalid feature");
    expect(()=>evaluateFormula("2+process.exit()",()=>0)).toThrow();
  });
  it("parses arithmetic precedence and right-associative powers",()=>{
    expect(numericExpression("2+3*4",[])).toBe(14);
    expect(numericExpression("2^3^2",[])).toBe(512);
    expect(numericExpression("-2^2",[])).toBe(-4);
    expect(numericExpression("(2+3)*4",[])).toBe(20);
    expect(renameParameterReferences("pitch/2+pitchOffset","pitch","span"))
      .toBe("span/2+pitchOffset");
  });
});
