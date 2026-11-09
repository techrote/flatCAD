/** Numeric fields use wheel adjustment only while the pointer is over
 * the field, never by globally hijacking the page's scrolling.
 * Named expressions retain their algebraic reference when stepped.
 */
export function wheelEditedValue(
  current:string,deltaY:number,step:number,shift=false,control=false
):string|null{
  if(!Number.isFinite(deltaY)||deltaY===0||!Number.isFinite(step)||step<=0)return null;
  const delta=(deltaY<0?1:-1)*step*(shift?.1:control?10:1);
  if(!current.trim())return null;
  const n=Number(current);
  if(Number.isFinite(n)){
    const next=Number((n+delta).toPrecision(13));
    return Number.isFinite(next)?String(next):null;
  }
  if(current.length>180)return null;
  const match=/^\((.+)\)\s*([+-])\s*(\d+(?:\.\d+)?)$/.exec(current.trim());
  if(match){
    const add=(match[2]==="-"?-1:1)*Number(match[3])+delta;
    const rounded=Number(add.toPrecision(13));
    if(rounded===0)return match[1];
    return "("+match[1]+")"+(rounded>=0?"+":"")+rounded;
  }
  return "("+current.trim()+")"+(delta>=0?"+":"")+Number(delta.toPrecision(13));
}
const TARGETS='input[type="number"],input[data-binding-target],input#extrude-z,input#extrude-depth,'+
  '#history-feature-editor input[type="text"]';
export function installNumericWheel(scope:Document=document):()=>void{
  const onWheel=(event:WheelEvent)=>{
    const target=event.target;
    if(!(target instanceof HTMLElement))return;
    const field=target.closest<HTMLInputElement>(TARGETS);
    if(!field||field.disabled||field.readOnly||!field.getClientRects().length)return;
    const raw=Number(field.step);
    const step=field.step==="any"||!Number.isFinite(raw)||raw<=0?1:raw;
    const next=wheelEditedValue(field.value,event.deltaY,step,event.shiftKey,event.ctrlKey||event.metaKey);
    if(next===null||next===field.value)return;
    event.preventDefault();
    field.focus({preventScroll:true});
    field.value=next;
    field.dispatchEvent(new Event("input",{bubbles:true}));
    field.dispatchEvent(new Event("change",{bubbles:true}));
  };
  scope.addEventListener("wheel",onWheel,{passive:false});
  return ()=>scope.removeEventListener("wheel",onWheel);
}
