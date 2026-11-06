import {describe,it,expect} from "vitest";
import { chordFromEvent,defaultPreferences,validatePreferences,validateShortcut,displayShortcut } from "./preferences";
describe("configurable keyboard and three-tier grid",()=>{
  it("round trips defaults without mutating caller",()=>{
    const pref=validatePreferences(JSON.parse(JSON.stringify(defaultPreferences())));
    expect(pref.grid.tiers).toHaveLength(3);
    expect(pref.shortcuts["tool.centerRectangle"]).toBe("Shift+KeyR");
    expect(pref.shortcuts["feature.extrude"]).toBe("KeyE");
    expect(pref.grid.tiers.map(t=>t.snap)).toEqual([false,true,false]);
  });
  it("turns key event code + modifiers into stable chords",()=>{
    expect(chordFromEvent({code:"KeyR",ctrlKey:false,altKey:false,shiftKey:true,metaKey:false})).toBe("Shift+KeyR");
    expect(displayShortcut("Shift+KeyR")).toBe("Shift+R");
  });
  it("rejects conflicting shortcut imports",()=>{
    const s=defaultPreferences();
    s.shortcuts["tool.rectangle"]="KeyE";
    expect(()=>validatePreferences(s)).toThrow("Duplicate shortcut");
  });
  it("rejects injected/invalid shortcut and grid settings",()=>{
    expect(()=>validateShortcut("console.log(3)")).toThrow();
    const s=defaultPreferences();
    s.grid.tiers[1].spacing=0;
    expect(()=>validatePreferences(s)).toThrow("Invalid grid");
  });
});
