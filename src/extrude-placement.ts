/** Cursor-corner extrusion flyout; sketch geometry may overlap the popup. */
export type Dimensions={width:number,height:number};
export type Point={x:number,y:number};
export type CursorCorner="top-left"|"top-right"|"bottom-left"|"bottom-right";
export type Placement={x:number,y:number,corner:CursorCorner,arrowAvoidancePx:number};
type Rect={left:number,top:number,right:number,bottom:number};
function overlap(a:Rect,b:Rect):boolean{
  return a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;
}
function box(x:number,y:number,p:Dimensions):Rect{
  return {left:x,right:x+p.width,top:y,bottom:y+p.height};
}
/** Prefer the upper-left mouse corner with minimal adjustment; if the panel
 * would cover the handle, shift horizontally. On viewport edges, flip the
 * anchored corner or clamp only as far as necessary. Never avoid sketch edges. */
export function placeExtrudeMenu(args:{
  viewport:Dimensions,cursor:Point,popup:Dimensions,arrow?:Point|null
}):Placement{
  const {viewport,cursor,popup}=args;
  const pad=8,clearance=16;
  const minX=pad,minY=pad,maxX=Math.max(pad,viewport.width-popup.width-pad),
    maxY=Math.max(pad,viewport.height-popup.height-pad);
  const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
  const arrow=args.arrow?{
    left:args.arrow.x-clearance,right:args.arrow.x+clearance,
    top:args.arrow.y-clearance,bottom:args.arrow.y+clearance
  }:null;
  const possibilities:{corner:CursorCorner,x:number,y:number}[]=[
    {corner:"top-left",x:cursor.x,y:cursor.y},
    {corner:"top-right",x:cursor.x-popup.width,y:cursor.y},
    {corner:"bottom-left",x:cursor.x,y:cursor.y-popup.height},
    {corner:"bottom-right",x:cursor.x-popup.width,y:cursor.y-popup.height},
  ];
  const scored=possibilities.map((candidate,index)=>{
    let x=clamp(candidate.x,minX,maxX);
    const y=clamp(candidate.y,minY,maxY);
    let sideShift=0;
    if(arrow&&overlap(box(x,y,popup),arrow)){
      const positions=[arrow.left-popup.width,arrow.right]
        .filter(value=>value>=minX&&value<=maxX)
        .filter(value=>!overlap(box(value,y,popup),arrow))
        .sort((a,b)=>Math.abs(a-x)-Math.abs(b-x));
      if(positions.length){sideShift=positions[0]-x;x=positions[0];}
    }
    const obstruction=arrow&&overlap(box(x,y,popup),arrow)?1:0;
    const displacement=Math.abs(x-candidate.x)+Math.abs(y-candidate.y);
    return {...candidate,x,y,sideShift,
      score:obstruction*100000+displacement+index*0.01};
  });
  scored.sort((a,b)=>a.score-b.score);
  const best=scored[0];
  return {x:best.x,y:best.y,corner:best.corner,arrowAvoidancePx:best.sideShift};
}
