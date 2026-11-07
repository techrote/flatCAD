import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { GeometryMesh } from "./kernel-protocol";
import { dragAction, orbitControlsBinding, type NavigationPreset } from "./navigation";
import { exactFaceElevation } from "./signed-extrusion";
import { presentationGridZ } from "./display-grid";
import type { SurfaceTarget } from "./surface-interaction";
import { isHighlightableSurface, VERTEX_HOVER_RADIUS_PX,
  worldRadiusForScreenPixels } from "./hover-policy";

/** OpenCascade B-rep-derived display; face picking references COMMITTED geometry only. */
export class Preview {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly orbit: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly referenceGrid: THREE.GridHelper;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pickPoint = new THREE.Vector2();
  private object: THREE.Group | null = null;
  private hasFramedSolid=false;
  private topologyVertices: THREE.Vector3[] = [];
  /** Topological vertex hover has a matching visible green sphere diameter. */
  private readonly vertexRadiusPx=VERTEX_HOVER_RADIUS_PX;
  private hoveredHighlight: THREE.Mesh | null = null;
  private hoveredKey = "";
  private lastHovered: SurfaceTarget | null = null;
  private onSurfaceHover: ((target:SurfaceTarget|null, pointer:{x:number,y:number})=>void)|null=null;
  private onSurfaceMenu: ((target:SurfaceTarget|null,pointer:{x:number,y:number})=>void)|null=null;
  private committedPickMesh: THREE.Mesh | null = null;
  private allowedElevations: number[] = [];
  private navigation: NavigationPreset = "fusion";
  private onFacePicked: ((z: number | null) => void) | null = null;
  private pointerDown: {x:number,y:number,button:number,action:string} | null = null;
  private animationId = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x0b1220);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.OrthographicCamera(-80, 80, 60, -60, 0.1, 100000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(130, -125, 115);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    // CAD should stop moving when a navigation drag ends. OrbitControls
    // damping kept rotating for seconds, causing apparent camera drift while
    // the user was drawing or applying a feature.
    this.orbit.enableDamping = false;
    this.orbit.target.set(0, 0, 0);
    this.orbit.addEventListener("change",()=>this.recordCameraState());
    this.setNavigationPreset("fusion");

    // Capture is necessary: OrbitControls reads the selected mouse action on
    // pointerdown. Changing it later (in a bubbling listener) is too late.
    const surface = this.renderer.domElement;
    surface.addEventListener("pointerdown", event => {
      const action = dragAction(this.navigation, event.button, {
        shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey,
      });
      this.pointerDown = { x:event.clientX,y:event.clientY,button:event.button,action };
      // Actual camera snapshots, not only the requested action, allow tests
      // to distinguish pan (fixed camera offset) from orbit (changed offset).
      this.orbit.update();
      this.container.dataset.cameraOffsetBefore=
        this.camera.position.clone().sub(this.orbit.target).toArray().join(",");
      this.container.dataset.cameraTargetBefore=this.orbit.target.toArray().join(",");
      // OrbitControls internally reverses PAN/ROTATE when a modifier is down.
      // Counter-swap here so Shift+MMB truly orbits rather than merely
      // reporting the word "orbit" while panning in the actual renderer.
      const modifier=event.shiftKey||event.ctrlKey||event.metaKey;
      const binding=this.toMouseAction(orbitControlsBinding(action,modifier));
      if(event.button===1) this.orbit.mouseButtons.MIDDLE=binding;
      if(event.button===2) this.orbit.mouseButtons.RIGHT=binding;
    }, {capture:true});
    surface.addEventListener("pointerup", event => {
      const start=this.pointerDown;
      this.pointerDown=null;
      if(!start||start.button!==event.button)return;
      const moved=Math.hypot(event.clientX-start.x,event.clientY-start.y);
      if(moved>4){
        this.container.dataset.lastNavigationAction=start.action;
        this.orbit.update();
        this.container.dataset.cameraPosition=this.camera.position.toArray().join(",");
        this.container.dataset.cameraTarget=this.orbit.target.toArray().join(",");
        this.container.dataset.cameraOffset=this.camera.position.clone().sub(this.orbit.target).toArray().join(",");
        return;
      }
      // Short left click latches the armed numeric field. Short right click
      // requests a context menu. Drags are exclusively navigation gestures.
      if(event.button===0&&this.onFacePicked)
        this.onFacePicked(this.pickTarget(event)?.target.z??null);
      if(event.button===2&&this.onSurfaceMenu)
        this.onSurfaceMenu(this.pickTarget(event)?.target??null,
          {x:event.clientX,y:event.clientY});
    });
    surface.addEventListener("pointercancel",()=>{this.pointerDown=null;});
    surface.addEventListener("pointermove",event=>{
      // Do not attribute transient triangle highlights while navigating.
      if(event.buttons!==0){
        this.clearHighlight();
        this.onSurfaceHover?.(null,{x:event.clientX,y:event.clientY});
        return;
      }
      const hit=this.pickTarget(event);
      this.showHighlight(hit);
      this.lastHovered=hit?.target??null;
      this.onSurfaceHover?.(this.lastHovered,{x:event.clientX,y:event.clientY});
    });
    surface.addEventListener("pointerleave",()=>{
      this.clearHighlight();
      this.lastHovered=null;
      this.onSurfaceHover?.(null,{x:0,y:0});
    });
    surface.addEventListener("auxclick",e=>{if(e.button===1)e.preventDefault();});
    surface.addEventListener("contextmenu",e=>e.preventDefault());

    this.scene.add(new THREE.AmbientLight(0xffffff, 2));
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(80, -40, 140);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x6a9fff, 1);
    fill.position.set(-80, 70, 50);
    this.scene.add(fill);
    const grid = new THREE.GridHelper(300, 30, 0x34567a, 0x1c3046);
    // This is only a visual reference floor, NOT the authoritative XY
    // sketch plane. It must remain below even downward-extruded solids.
    grid.rotation.x = Math.PI / 2;
    grid.material.depthTest = true;
    grid.material.depthWrite = false;
    grid.renderOrder = -100;
    this.referenceGrid=grid;
    this.scene.add(grid);
    this.scene.add(new THREE.AxesHelper(35));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate();
  }

  private toMouseAction(action:"none"|"pan"|"orbit"|"dolly"):number {
    switch(action){
      case "pan":return THREE.MOUSE.PAN;
      case "orbit":return THREE.MOUSE.ROTATE;
      case "dolly":return THREE.MOUSE.DOLLY;
      default:return -1;
    }
  }
  setNavigationPreset(preset:NavigationPreset):void {
    this.navigation=preset;
    this.container.dataset.navigationPreset=preset;
    // No LMB navigation in CAD-style presets. LMB is reserved for face picks
    // and potential direct 3D selection; wheel remains zoom via OrbitControls.
    this.orbit.mouseButtons.LEFT=null;
    this.orbit.mouseButtons.MIDDLE=this.toMouseAction(dragAction(preset,1,{shift:false,ctrl:false}));
    this.orbit.mouseButtons.RIGHT=this.toMouseAction(dragAction(preset,2,{shift:false,ctrl:false}));
  }
  setFacePickHandler(handler:((z:number|null)=>void)|null):void{this.onFacePicked=handler;}
  setSurfaceHoverHandler(handler:((target:SurfaceTarget|null,pointer:{x:number,y:number})=>void)|null):void{
    this.onSurfaceHover=handler;
  }
  setSurfaceMenuHandler(handler:((target:SurfaceTarget|null,pointer:{x:number,y:number})=>void)|null):void{
    this.onSurfaceMenu=handler;
  }
  setFaceElevations(heights:readonly number[]):void {
    this.allowedElevations=heights.filter(Number.isFinite);
  }

  /** Keep the raycast mesh independent from the coloured provisional result. */
  setCommittedPickMesh(mesh:GeometryMesh|null):void {
    this.clearHighlight();
    this.topologyVertices=[];
    if(this.committedPickMesh){
      this.committedPickMesh.geometry.dispose();
      (this.committedPickMesh.material as THREE.Material).dispose();
      this.committedPickMesh=null;
    }
    if(!mesh||!mesh.triangles.length)return;
    const geometry=this.makeGeometry(mesh);
    for(let i=0;i+2<(mesh.topologyVertices?.length??0);i+=3){
      this.topologyVertices.push(new THREE.Vector3(
        mesh.topologyVertices[i],mesh.topologyVertices[i+1],mesh.topologyVertices[i+2]));
    }
    this.container.dataset.topologyVertexCount=String(this.topologyVertices.length);
    this.committedPickMesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    this.committedPickMesh.updateMatrixWorld(true);
  }
  /** Pick exact B-rep edge endpoints first; then the committed surface.
   *  Never identify arbitrary tessellation triangle corners as CAD vertices. */
  private pickTarget(event:PointerEvent):{
    target:SurfaceTarget,faceIndex:number,normal:THREE.Vector3,point:THREE.Vector3
  }|null{
    const pick=this.committedPickMesh;
    if(!pick)return null;
    const bounds=this.renderer.domElement.getBoundingClientRect();
    if(bounds.width<=0||bounds.height<=0)return null;
    const px=event.clientX-bounds.left,py=event.clientY-bounds.top;
    this.pickPoint.set(2*px/bounds.width-1,1-2*py/bounds.height);
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pickPoint,this.camera);
    const hits=this.raycaster.intersectObject(pick,false);
    // A 17-CSS-pixel circle is both the hover activation zone and the
    // apparent radius of the translucent green sphere.
    let nearest:THREE.Vector3|null=null;
    let nearestPx=this.vertexRadiusPx;
    for(const v of this.topologyVertices){
      const screen=v.clone().project(this.camera);
      if(screen.z<-1||screen.z>1)continue;
      const sx=(screen.x+1)*bounds.width/2,sy=(1-screen.y)*bounds.height/2;
      const d=Math.hypot(sx-px,sy-py);
      if(d>nearestPx)continue;
      const occluded=hits.length>0 &&
        v.distanceTo(this.camera.position)>hits[0].distance+.03;
      if(occluded)continue;
      nearest=v;nearestPx=d;
    }
    if(nearest){
      const z=exactFaceElevation(nearest.z,this.allowedElevations,.002)??nearest.z;
      const target:SurfaceTarget={kind:"vertex",point:[nearest.x,nearest.y,nearest.z],
        z,normal:[0,0,0]};
      return {target,faceIndex:-1,normal:new THREE.Vector3(),point:nearest.clone()};
    }
    const positions=pick.geometry.getAttribute("position");
    for(const hit of hits){
      if(!hit.face||hit.faceIndex==null)continue;
      const triangle=hit.face;
      const v=[
        new THREE.Vector3().fromBufferAttribute(positions,triangle.a),
        new THREE.Vector3().fromBufferAttribute(positions,triangle.b),
        new THREE.Vector3().fromBufferAttribute(positions,triangle.c)
      ];
      // Only horizontal planar faces can supply an exact source Z.
      const flat=Math.max(...v.map(p=>p.z))-Math.min(...v.map(p=>p.z))<.002;
      const z=flat&&Math.abs(triangle.normal.z)>.995
        ?exactFaceElevation(v[0].z,this.allowedElevations,.002):null;
      const target:SurfaceTarget={kind:"face",
        point:[hit.point.x,hit.point.y,hit.point.z],
        z,normal:[triangle.normal.x,triangle.normal.y,triangle.normal.z]};
      return {target,faceIndex:hit.faceIndex,normal:triangle.normal.clone().normalize(),
        point:hit.point.clone()};
    }
    return null;
  }
  /** Highlight a co-planar surface patch, not the whole object. Curved facets
   *  highlight the selected tessellated patch; exact topology is untouched. */
  private showHighlight(hit:{target:SurfaceTarget,faceIndex:number,normal:THREE.Vector3,point:THREE.Vector3}|null):void{
    if(!hit||!this.committedPickMesh){this.clearHighlight();return;}
    if(hit.target.kind==="vertex"){
      const v=hit.point;
      const key="vertex:"+v.toArray().map(n=>n.toFixed(5)).join("/")+
        "/zoom:"+this.camera.zoom.toFixed(4);
      if(key===this.hoveredKey&&this.hoveredHighlight)return;
      this.clearHighlight();
      const bounds=this.renderer.domElement.getBoundingClientRect();
      const radiusWorld=worldRadiusForScreenPixels(this.vertexRadiusPx,
        this.camera.top-this.camera.bottom,this.camera.zoom,Math.max(1,bounds.height));
      const sphere=new THREE.Mesh(new THREE.SphereGeometry(radiusWorld,24,16),
        new THREE.MeshBasicMaterial({
          color:0x20f293,transparent:true,opacity:.37,
          side:THREE.DoubleSide,depthWrite:false,depthTest:false
        }));
      sphere.position.copy(v);
      sphere.renderOrder=16;
      this.scene.add(sphere);
      this.hoveredHighlight=sphere;
      this.hoveredKey=key;
      this.container.dataset.hoveredTargetKind="vertex";
      this.container.dataset.hoveredFaceZ=String(hit.target.z);
      this.container.dataset.vertexHitRadiusPx=String(this.vertexRadiusPx);
      this.container.dataset.vertexSphereRadiusPx=String(this.vertexRadiusPx);
      this.container.dataset.vertexSphereVisible="true";
      this.container.dataset.highlightTriangleCount="0";
      return;
    }
    // Side/sloped faces deliberately receive NO coloured overlay.
    if(!isHighlightableSurface(hit.target)){
      this.clearHighlight();return;
    }
    const n=hit.normal;
    const distance=n.dot(hit.point);
    const key=[
      Math.round(n.x*100),Math.round(n.y*100),Math.round(n.z*100),
      Math.round(distance*1000)
    ].join("/");
    if(key===this.hoveredKey&&this.hoveredHighlight)return;
    this.clearHighlight();
    const geo=this.committedPickMesh.geometry;
    const attr=geo.getAttribute("position"),idx=geo.getIndex();
    if(!idx)return;
    const vertices:number[]=[],indices:number[]=[];
    const p=new THREE.Vector3(),q=new THREE.Vector3(),r=new THREE.Vector3();
    const normal=new THREE.Vector3();
    const triangles=idx.count/3;
    for(let i=0;i<triangles;i++){
      const ia=idx.getX(3*i),ib=idx.getX(3*i+1),ic=idx.getX(3*i+2);
      p.fromBufferAttribute(attr,ia);
      q.fromBufferAttribute(attr,ib);
      r.fromBufferAttribute(attr,ic);
      normal.copy(q).sub(p).cross(new THREE.Vector3().copy(r).sub(p)).normalize();
      if(Math.abs(normal.dot(n))<.99)continue;
      if(Math.abs(n.dot(p)-distance)>.003||
         Math.abs(n.dot(q)-distance)>.003||
         Math.abs(n.dot(r)-distance)>.003)continue;
      const offset=vertices.length/3;
      vertices.push(p.x,p.y,p.z,q.x,q.y,q.z,r.x,r.y,r.z);
      indices.push(offset,offset+1,offset+2);
    }
    // Degenerate or curved surfaces still show the raycast triangle itself.
    if(!indices.length){
      const i=hit.faceIndex,ia=idx.getX(3*i),ib=idx.getX(3*i+1),ic=idx.getX(3*i+2);
      for(const id of [ia,ib,ic]){
        p.fromBufferAttribute(attr,id);vertices.push(p.x,p.y,p.z);
      }
      indices.push(0,1,2);
    }
    const highlightGeo=new THREE.BufferGeometry();
    highlightGeo.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
    highlightGeo.setIndex(indices);
    this.hoveredHighlight=new THREE.Mesh(highlightGeo,new THREE.MeshBasicMaterial({
      color:0x13e1ff,
      transparent:true,opacity:.72,side:THREE.DoubleSide,
      depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2
    }));
    this.hoveredHighlight.renderOrder=10;
    this.scene.add(this.hoveredHighlight);
    this.hoveredKey=key;
    this.container.dataset.hoveredTargetKind=hit.target.kind;
    if(hit.target.z!==null)this.container.dataset.hoveredFaceZ=String(hit.target.z);
    else delete this.container.dataset.hoveredFaceZ;
    this.container.dataset.highlightTriangleCount=String(indices.length/3);
  }
  private clearHighlight():void{
    if(this.hoveredHighlight){
      this.scene.remove(this.hoveredHighlight);
      this.hoveredHighlight.geometry.dispose();
      (this.hoveredHighlight.material as THREE.Material).dispose();
      this.hoveredHighlight=null;
    }
    this.hoveredKey="";
    delete this.container.dataset.hoveredFaceZ;
    delete this.container.dataset.hoveredTargetKind;
    delete this.container.dataset.highlightTriangleCount;
    delete this.container.dataset.vertexHitRadiusPx;
    delete this.container.dataset.vertexSphereRadiusPx;
    delete this.container.dataset.vertexSphereVisible;
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    const span = 100;
    const aspect = width / height;
    this.camera.left = -span * aspect / 2;
    this.camera.right = span * aspect / 2;
    this.camera.top = span / 2;
    this.camera.bottom = -span / 2;
    this.camera.updateProjectionMatrix();
  }

  private makeGeometry(mesh:GeometryMesh):THREE.BufferGeometry {
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(mesh.vertices,3));
    geometry.setIndex(mesh.triangles);
    if(mesh.normals.length===mesh.vertices.length){
      geometry.setAttribute("normal",new THREE.Float32BufferAttribute(mesh.normals,3));
    }else geometry.computeVertexNormals();
    return geometry;
  }

  /** Display buffers are built before the old group is released, so an
   * async rebuild never renders an empty intermediate scene.
   * Camera pose is untouched after the first model fit unless explicitly
   * requested by the user. */
  setMesh(mesh:GeometryMesh|null, options:{
    pending?:"add"|"cut"; preserveCamera?:boolean;
    cutTool?:GeometryMesh|null; fitCamera?:boolean
  }={}):void{
    if(!mesh||!mesh.triangles.length){
      if(this.object)this.retireGroup(this.object);
      this.object=null;
      if(!options.pending)this.setCommittedPickMesh(null);
      this.referenceGrid.position.z=0;
      this.container.dataset.gridZ="0";
      this.container.dataset.renderedSolid="false";
      this.hasFramedSolid=false;
      delete this.container.dataset.cutToolVisible;
      delete this.container.dataset.displayModelMinZ;
      delete this.container.dataset.displayBottomZ;
      return;
    }
    const group=new THREE.Group();
    try{
      group.add(new THREE.Mesh(this.makeGeometry(mesh),new THREE.MeshStandardMaterial({
        color:options.pending==="add"?0x73d1b8:
          options.pending==="cut"?0xf2af7d:0x6aacf4,
        metalness:.2,roughness:.58,side:THREE.DoubleSide
      })));
      if(options.pending==="cut"&&options.cutTool?.triangles.length){
        const tool=new THREE.Mesh(this.makeGeometry(options.cutTool),
          new THREE.MeshBasicMaterial({color:0xe6304c,transparent:true,
            opacity:.25,side:THREE.DoubleSide,depthWrite:false,
            depthTest:false,polygonOffset:true,polygonOffsetFactor:-1}));
        tool.name="Full cutting tool including overshoot";
        tool.renderOrder=7;
        group.add(tool);
      }
      if(mesh.edgeLines.length){
        const lines=new THREE.BufferGeometry();
        lines.setAttribute("position",new THREE.Float32BufferAttribute(mesh.edgeLines,3));
        group.add(new THREE.LineSegments(lines,
          new THREE.LineBasicMaterial({color:0x152a45})));
      }
      // Add replacement before retiring old geometry; all of this runs
      // synchronously within one animation frame.
      const previous=this.object;
      this.scene.add(group);
      this.object=group;
      if(!options.pending)this.setCommittedPickMesh(mesh);
      if(previous)this.retireGroup(previous);
      this.container.dataset.renderedSolid="true";
      if(options.pending==="cut"&&options.cutTool?.triangles.length)
        this.container.dataset.cutToolVisible="true";
      else delete this.container.dataset.cutToolVisible;
      const bounds=new THREE.Box3().setFromObject(group);
      const modelBounds=new THREE.Box3().setFromObject(group.children[0]);
      if(!bounds.isEmpty()&&!modelBounds.isEmpty()){
        const gridZ=presentationGridZ(modelBounds.min.z,
          modelBounds.max.z-modelBounds.min.z,bounds.min.z);
        this.referenceGrid.position.z=gridZ;
        this.referenceGrid.updateMatrixWorld();
        this.container.dataset.gridZ=String(gridZ);
        this.container.dataset.displayModelMinZ=String(modelBounds.min.z);
        this.container.dataset.displayBottomZ=String(bounds.min.z);
      }
      if(options.fitCamera||(!this.hasFramedSolid&&!options.preserveCamera)){
        this.frameBounds(bounds);
        this.hasFramedSolid=true;
      }
      this.recordCameraState();
    }catch(error){
      // An incomplete candidate never leaves the viewport blank.
      if(this.object===group){this.object=null;this.scene.remove(group);}
      this.disposeGroup(group);
      throw error;
    }
  }
  private retireGroup(group:THREE.Group):void{
    this.scene.remove(group);
    this.disposeGroup(group);
  }
  private disposeGroup(group:THREE.Group):void{
    group.traverse(node=>{
      if(node instanceof THREE.Mesh||node instanceof THREE.LineSegments){
        node.geometry.dispose();
        for(const material of (Array.isArray(node.material)?node.material:[node.material]))
          material.dispose();
      }
    });
  }
  private recordCameraState():void{
    this.container.dataset.cameraDirection=
      this.camera.position.clone().sub(this.orbit.target).normalize().toArray().join(",");
    this.container.dataset.cameraTarget=this.orbit.target.toArray().join(",");
    this.container.dataset.cameraZoom=String(this.camera.zoom);
  }
  private frameBounds(bounds:THREE.Box3):void{
    if(bounds.isEmpty())return;
    const center=bounds.getCenter(new THREE.Vector3());
    const radius=Math.max(1,bounds.getSize(new THREE.Vector3()).length());
    // Preserve *direction*, including when the user explicitly asks Fit.
    const direction=this.camera.position.clone().sub(this.orbit.target).normalize();
    this.orbit.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction,Math.max(10,radius*1.4));
    this.camera.zoom=Math.max(.05,130/(radius*1.5));
    this.camera.updateProjectionMatrix();
    this.orbit.update();
    this.container.dataset.cameraFitCount=String(
      (Number(this.container.dataset.cameraFitCount)||0)+1);
  }
  fitView():void{
    if(!this.object)return;
    this.frameBounds(new THREE.Box3().setFromObject(this.object));
    this.hasFramedSolid=true;
  }
  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.orbit.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.animationId);
    this.resizeObserver.disconnect();
    this.orbit.dispose();
    this.onFacePicked=null;
    this.onSurfaceHover=null;
    this.onSurfaceMenu=null;
    this.clearHighlight();
    this.setMesh(null);
    this.setCommittedPickMesh(null);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
