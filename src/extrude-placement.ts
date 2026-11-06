/** Position popup with one corner at cursor. Only the extrusion arrow may displace it. */
export type Dimensions={width:number,height:number};
export type Point={x:number,y:number};
export type CursorCorner="top-left"|"top-right"|"bottom-left"|"bottom-right";
export type Placement={x:number,y:number,corner:CursorCorner,arrowAvoidancePx:number};
export type Rectangle2={left:number,top:number,right:number,bottom:number};

function overlap(a:Rectangle2,b:Rectangle2):number{
  return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)) *
    Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
}
function rect(x:number,y:number,p:Dimensions):Rectangle2{
  return {left:x,top:y,right:x+p.width,bottom:y+p.height};
}
/** No sketch-overlap test: the corner closest to the cursor is preferred unless
 *  it would cover the arrow or leave the viewport. If the arrow lies under the
 *  popup, move the popup HORIZONTALLY just far enough to expose the handle. */
export function placeExtrudeMenu(args:{
  viewport:Dimensions;cursor:Point;popup:Dimensions;arrow?:Point|null;
}):Placement{
  const {viewport:v,cursor:c,popup:p}=args;
  const margin=8,clearance=16;
  const maxX=Math.max(margin,v.width-p.width-margin);
  const maxY=Math.max(margin,v.height-p.height-margin);
  const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));
  const arrowRect=args.arrow?{
    left:args.arrow.x-clearance,right:args.arrow.x+clearance,
    top:args.arrow.y-clearance,bottom:args.arrow.y+clearance
  }:null;
  const corners:{corner:CursorCorner,x:number,y:number}[]=[
    {corner:"top-left",x:c.x,y:c.y},
    {corner:"top-right",x:c.x-p.width,y:c.y},
    {corner:"bottom-left",x:c.x,y:c.y-p.height},
    {corner:"bottom-right",x:c.x-p.width,y:c.y-p.height},
  ];
  const scored=corners.map((candidate,index)=>{
    const x=clamp(candidate.x,margin,maxX);
    const y=clamp(candidate.y,margin,maxY);
    const dislocation=Math.abs(x-candidate.x)+Math.abs(y-candidate.y);
    const arrowOverlap=arrowRect?overlap(rect(x,y,p),arrowRect):0;
    // Caller receives the exact cursor corner when there is room.
    return {...candidate,index,x,y,dislocation,arrowOverlap};
  });
  for(const candidate of scored){
    if(candidate.dislocation===0&&candidate.arrowOverlap===0)
      return {x:candidate.x,y:candidate.y,corner:candidate.corner,arrowAvoidancePx:0};
  }
  const first=scored[0],other=scored.filter(c=>c.dislocation===0&&c.arrowOverlap===0)[0];
  if(other)return {x:other.x,y:other.y,corner:other.corner,arrowAvoidancePx:0};
  const chosen=scored.sort((a,b)=>(a.dislocation+a.arrowOverlap*1000+a.index*.01)-
                                       (b.dislocation+b.arrowOverlap*1000+b.index*.01))[0];
  let x=chosen.x,y=chosen.y,offset=0;
  if(arrowRect&&overlap(rect(x,y,p),arrowRect)>0){
    const left=arrowRect.left-p.width, right=arrowRect.right;
    const options=[left,right].filter(candidate=>candidate>=margin&&candidate<=maxX)
      .filter(candidate=>overlap(rect(candidate,y,p),arrowRect)===0)
      .sort((a,b)=>Math.abs(a-x)-Math.abs(b-x));
    if(options.length){offset=options[0]-x;x=options[0];}
  }
  return {x,y,corner:chosen.corner,arrowAvoidancePx:offset};
}
