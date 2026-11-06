import {describe,it,expect} from "vitest";
import {placeExtrudeMenu} from "./extrude-placement";
const viewport={width:1000,height:720},popup={width:260,height:320};
describe("cursor-corner extrusion flyout",()=>{
  it("pins top-left corner to cursor even over sketch geometry",()=>{
    expect(placeExtrudeMenu({viewport,popup,cursor:{x:220,y:110}}))
      .toEqual({x:220,y:110,corner:"top-left",arrowAvoidancePx:0});
  });
  it("flips to a different cursor corner by the viewport edges",()=>{
    const p=placeExtrudeMenu({viewport,popup,cursor:{x:915,y:600}});
    expect(p.corner).toBe("bottom-right");expect(p.x).toBe(655);expect(p.y).toBe(280);
  });
  it("offsets SIDEWAYS if no cursor corner avoids the arrow",()=>{
    const p=placeExtrudeMenu({viewport:{width:400,height:500},popup:{width:220,height:270},
      cursor:{x:150,y:200},arrow:{x:160,y:230}});
    expect(Number.isFinite(p.x)).toBe(true);
    expect(p.x).toBeGreaterThanOrEqual(8);
  });
  it("keeps preferred cursor corner by sliding away from arrow on a short viewport",()=>{
    const cursor={x:210,y:45};
    const p=placeExtrudeMenu({
      viewport:{width:780,height:510},
      popup:{width:258,height:459},
      cursor,arrow:{x:421,y:234}
    });
    expect(p.corner).toBe("top-left");
    expect(p.x).toBeLessThan(cursor.x);
    expect(Math.abs((p.x-cursor.x)-p.arrowAvoidancePx)).toBeLessThan(1e-8);
    expect(Math.abs(p.y-cursor.y)).toBeLessThanOrEqual(3);
  });
  it("changes nothing when the arrow is elsewhere",()=>{
    const p=placeExtrudeMenu({viewport,popup,cursor:{x:190,y:80},arrow:{x:700,y:600}});
    expect(p.x).toBe(190);expect(p.y).toBe(80);
  });
});
