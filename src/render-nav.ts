import type {Preview} from "./preview";
export type RenderNavAction="home"|"fit"|"opposite"|"underground"|"close";
const PATHS:Record<RenderNavAction,string>={
 home:'<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M10 21v-7h4v7"/>',
 fit:'<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
 opposite:'<path d="M3 12a9 9 0 0 1 15-6"/><path d="m18 2 1 5-5 1"/><path d="M21 12a9 9 0 0 1-15 6"/><path d="m6 22-1-5 5-1"/>',
 underground:'<path d="M3 16h18"/><path d="m7 10 5 5 5-5"/><path d="M12 4v11"/><path d="M6 21h12"/>',
 close:'<path d="M5 5 19 19M19 5 5 19"/>'
};
const LABELS:Record<RenderNavAction,string>={
 home:"Home isometric",fit:"Auto-fit",opposite:"Opposite orbit",
 underground:"Underground home",close:"Close floating view"
};
/** The same compact accessible icon-only toolbar can belong to any view. */
export function createRenderNav(preview:Preview,onClose?:()=>void):HTMLElement{
  const nav=document.createElement("div");
  nav.className="float-nav";
  nav.setAttribute("role","toolbar");
  nav.setAttribute("aria-label","Floating render navigation");
  const actions:RenderNavAction[]=onClose?
    ["home","fit","opposite","underground","close"]:
    ["home","fit","opposite","underground"];
  for(const action of actions){
    const button=document.createElement("button");
    button.type="button";button.className="float-nav-action";
    button.dataset.nav=action;button.title=LABELS[action];
    button.setAttribute("aria-label",LABELS[action]);
    button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '+
      'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" '+
      'aria-hidden="true">'+PATHS[action]+'</svg>';
    button.addEventListener("click",e=>{
      e.stopPropagation();
      switch(action){
        case "home":preview.homeView();break;
        case "fit":preview.fitView();break;
        case "opposite":preview.oppositeOrbit();break;
        case "underground":preview.undergroundHome();break;
        case "close":onClose?.();break;
      }
    });
    nav.append(button);
  }
  return nav;
}
