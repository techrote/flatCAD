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

describe("CAD control settings migration",()=>{
  it("defaults to Fusion and preserves imported legacy JSON without navigation",()=>{
    const defaults=defaultPreferences();
    expect(defaults.navigation).toBe("fusion");
    const legacy={...defaults};delete (legacy as Partial<typeof legacy>).navigation;
    expect(validatePreferences(legacy).navigation).toBe("fusion");
  });
  it("round trips another navigation preset and rejects unknown identifiers",()=>{
    const prefs={...defaultPreferences(),navigation:"blender" as const};
    expect(validatePreferences(JSON.parse(JSON.stringify(prefs))).navigation).toBe("blender");
    expect(()=>validatePreferences({...prefs,navigation:"malicious"})).toThrow("Unknown CAD navigation preset");
  });
});

describe("remember interaction surfaces preference",()=>{
  it("defaults on and migrates old preference JSON",()=>{
    const current=defaultPreferences();
    expect(current.rememberSurfaces).toBe(true);
    const old={...current};delete (old as Partial<typeof old>).rememberSurfaces;
    expect(validatePreferences(old).rememberSurfaces).toBe(true);
  });
  it("permits opt-out and rejects malformed settings",()=>{
    expect(validatePreferences({...defaultPreferences(),rememberSurfaces:false}).rememberSurfaces).toBe(false);
    expect(()=>validatePreferences({...defaultPreferences(),rememberSurfaces:"yes"})).toThrow();
  });
});

describe("Fit-view shortcut migration",()=>{
  it("adds F to prior settings without losing existing rebinding",()=>{
    const old=defaultPreferences();
    delete (old.shortcuts as Partial<typeof old.shortcuts>)["view.fit"];
    const migrated=validatePreferences(old);
    expect(migrated.shortcuts["view.fit"]).toBe("KeyF");
    old.shortcuts["tool.rectangle"]="KeyF";
    expect(validatePreferences(old).shortcuts["view.fit"]).toBe("");
    expect(validatePreferences(old).shortcuts["tool.rectangle"]).toBe("KeyF");
  });
});

describe("rotate tool shortcut migration",()=>{
  it("adds default O without erasing existing user preferences",()=>{
    const old=defaultPreferences();
    delete (old.shortcuts as Partial<typeof old.shortcuts>)["tool.rotate"];
    expect(validatePreferences(old).shortcuts["tool.rotate"]).toBe("KeyO");
    old.shortcuts["tool.pan"]="KeyO";
    expect(validatePreferences(old).shortcuts["tool.rotate"]).toBe("");
  });
});
