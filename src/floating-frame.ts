/** Shared, purely UI floating CAD frame controls. No B-rep/document changes. */
export type FloatRect={left:number;top:number;width:number;height:number};
export type FloatMode="move"|"sw"|"se";
export type FloatViewport={width:number;height:number};
export const MIN_FLOAT_WIDTH=220,MIN_FLOAT_HEIGHT=180;
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const minTop=(h:number,v:FloatViewport)=>Math.min(65,Math.max(0,v.height-h));
export function positionedFloatRect(x:number,y:number,w:number,h:number,v:FloatViewport):FloatRect{
  w=clamp(w,Math.min(MIN_FLOAT_WIDTH,v.width),v.width);
  h=clamp(h,Math.min(MIN_FLOAT_HEIGHT,v.height),v.height);
  const top=minTop(h,v);
  return {left:Math.round(clamp(x,0,1)*(v.width-w)),
    top:Math.round(top+clamp(y,0,1)*(v.height-h-top)),width:w,height:h};
}
export function normalizedFloatRect(r:FloatRect,v:FloatViewport):{x:number;y:number}{
  const xMax=Math.max(0,v.width-r.width),yMin=minTop(r.height,v);
  const ySpan=Math.max(0,v.height-r.height-yMin);
  return {x:xMax?clamp(r.left/xMax,0,1):0,y:ySpan?clamp((r.top-yMin)/ySpan,0,1):0};
}
export function moveResizeFloatRect(start:FloatRect,mode:FloatMode,dx:number,dy:number,
  v:FloatViewport):FloatRect{
  const wMin=Math.min(MIN_FLOAT_WIDTH,v.width),hMin=Math.min(MIN_FLOAT_HEIGHT,v.height);
  if(mode==="move")return {...start,
    left:clamp(start.left+dx,0,Math.max(0,v.width-start.width)),
    top:clamp(start.top+dy,minTop(start.height,v),Math.max(minTop(start.height,v),v.height-start.height))};
  let left=start.left,top=start.top,right=start.left+start.width,bottom=start.top+start.height;
  if(mode.includes("w"))left=clamp(left+dx,0,right-wMin);
  if(mode.includes("e"))right=clamp(right+dx,left+wMin,v.width);
  if(mode.includes("s"))bottom=clamp(bottom+dy,top+hMin,v.height);
  return {left,top,width:right-left,height:bottom-top};
}
const viewport=():FloatViewport=>({width:Math.max(1,innerWidth),height:Math.max(1,innerHeight)});
export function installFloatingFrame(panel:HTMLElement,options:{
  enabled?:()=>boolean;onChange:(r:FloatRect)=>void;onEnd:()=>void;
}):()=>void{
  const controls:HTMLButtonElement[]=[];
  function add(mode:FloatMode,title:string){
    const b=document.createElement("button");b.type="button";
    b.className=mode==="move"?"float-window-handle":"float-corner-grip";
    b.innerHTML=mode==="move"
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '+
        'stroke-width="1.75" stroke-linecap="round" aria-hidden="true">'+
        '<path d="M4 7h16M4 12h16M4 17h16"/></svg>' : "";
    if(mode==="move")b.dataset.floatHandle="";else b.dataset.corner=mode;
    b.title=title;b.setAttribute("aria-label",title);
    panel.append(b);controls.push(b);
    let drag:{id:number;x:number;y:number;rect:FloatRect;changed:boolean}|null=null;
    const apply=(r:FloatRect)=>{
      panel.style.left=Math.round(r.left)+"px";panel.style.top=Math.round(r.top)+"px";
      panel.style.width=Math.round(r.width)+"px";panel.style.height=Math.round(r.height)+"px";
      options.onChange(r);
    };
    b.addEventListener("pointerdown",e=>{
      if(e.button!==0||options.enabled?.()===false)return;
      const r=panel.getBoundingClientRect();
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,
        rect:{left:r.left,top:r.top,width:r.width,height:r.height},changed:false};
      b.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();
    });
    b.addEventListener("pointermove",e=>{
      if(!drag||drag.id!==e.pointerId)return;
      const r=moveResizeFloatRect(drag.rect,mode,e.clientX-drag.x,e.clientY-drag.y,viewport());
      if(Math.abs(r.left-drag.rect.left)+Math.abs(r.top-drag.rect.top)+
        Math.abs(r.width-drag.rect.width)+Math.abs(r.height-drag.rect.height)<.5)return;
      drag.changed=true;apply(r);e.preventDefault();e.stopPropagation();
    });
    const finish=(e:PointerEvent)=>{
      if(!drag||drag.id!==e.pointerId)return;
      const changed=drag.changed;drag=null;
      if(b.hasPointerCapture(e.pointerId))b.releasePointerCapture(e.pointerId);
      if(changed)options.onEnd();
      e.preventDefault();e.stopPropagation();
    };
    b.addEventListener("pointerup",finish);b.addEventListener("pointercancel",finish);
    b.addEventListener("keydown",e=>{
      if(options.enabled?.()===false)return;
      const dirs:Record<string,[number,number]>={
        ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      const delta=dirs[e.key];if(!delta)return;
      e.preventDefault();e.stopPropagation();
      const r=panel.getBoundingClientRect();
      apply(moveResizeFloatRect({left:r.left,top:r.top,width:r.width,height:r.height},
        mode,delta[0]*(e.shiftKey?1:10),delta[1]*(e.shiftKey?1:10),viewport()));
      options.onEnd();
    });
  }
  add("move","Move floating viewport");
  for(const c of ["sw","se"] as const)
    add(c,"Resize floating viewport from "+c.toUpperCase()+" corner");
  return ()=>{for(const b of controls)b.remove();};
}
