import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { GeometryMesh } from "./kernel-protocol";
import { dragAction, orbitControlsBinding, type NavigationPreset } from "./navigation";
import { exactFaceElevation } from "./signed-extrusion";

/** OpenCascade B-rep-derived display; face picking references COMMITTED geometry only. */
export class Preview {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly orbit: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pickPoint = new THREE.Vector2();
  private object: THREE.Group | null = null;
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
    this.orbit.enableDamping = true;
    this.orbit.target.set(0, 0, 0);
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
      // Left mouse click picks a committed horizontal B-rep face if a numeric
      // extrusion field is armed. Orbit, pan and right click never pick faces.
      if(event.button===0&&this.onFacePicked)this.onFacePicked(this.pickHorizontalFace(event));
    });
    surface.addEventListener("pointercancel",()=>{this.pointerDown=null;});
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
    grid.rotation.x = Math.PI / 2;
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
  setFaceElevations(heights:readonly number[]):void {
    this.allowedElevations=heights.filter(Number.isFinite);
  }

  /** Keep the raycast mesh independent from the coloured provisional result. */
  setCommittedPickMesh(mesh:GeometryMesh|null):void {
    if(this.committedPickMesh){
      this.committedPickMesh.geometry.dispose();
      (this.committedPickMesh.material as THREE.Material).dispose();
      this.committedPickMesh=null;
    }
    if(!mesh||!mesh.triangles.length)return;
    const geometry=this.makeGeometry(mesh);
    this.committedPickMesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    this.committedPickMesh.updateMatrixWorld(true);
  }
  private pickHorizontalFace(event:PointerEvent):number|null {
    const target=this.committedPickMesh;
    if(!target||!this.allowedElevations.length)return null;
    const rect=this.renderer.domElement.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return null;
    this.pickPoint.set(
      2*(event.clientX-rect.left)/rect.width-1,
      1-2*(event.clientY-rect.top)/rect.height
    );
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pickPoint,this.camera);
    const hits=this.raycaster.intersectObject(target,false);
    const coordinates=target.geometry.getAttribute("position");
    for(const hit of hits){
      if(!hit.face||Math.abs(hit.face.normal.z)<0.995)continue;
      const z1=coordinates.getZ(hit.face.a),z2=coordinates.getZ(hit.face.b),z3=coordinates.getZ(hit.face.c);
      // Planar horizontal triangles only; reject cylindrical sides and
      // sloping surfaces even if clicked triangle has a near-horizontal normal.
      if(Math.max(z1,z2,z3)-Math.min(z1,z2,z3)>0.001)continue;
      const exact=exactFaceElevation((z1+z2+z3)/3,this.allowedElevations,0.002);
      if(exact!==null)return exact;
    }
    return null;
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

  setMesh(mesh: GeometryMesh | null, options: { pending?: "add" | "cut"; preserveCamera?: boolean } = {}): void {
    if(!options.pending)this.setCommittedPickMesh(mesh);
    if (this.object) {
      this.scene.remove(this.object);
      this.object.traverse(node => {
        if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
          node.geometry.dispose();
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach(material => material.dispose());
        }
      });
      this.object = null;
    }
    if (!mesh || mesh.triangles.length === 0) return;
    const group = new THREE.Group();
    group.add(new THREE.Mesh(this.makeGeometry(mesh), new THREE.MeshStandardMaterial({
      color: options.pending === "add" ? 0x73d1b8 : options.pending === "cut" ? 0xf2af7d : 0x6aacf4,
      metalness: 0.2, roughness: 0.58, side: THREE.DoubleSide
    })));
    if (mesh.edgeLines.length) {
      const lines = new THREE.BufferGeometry();
      lines.setAttribute("position", new THREE.Float32BufferAttribute(mesh.edgeLines, 3));
      group.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0x152a45 })));
    }
    this.scene.add(group);
    this.object = group;
    const bounds = new THREE.Box3().setFromObject(group);
    if (!options.preserveCamera && !bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      const radius = bounds.getSize(new THREE.Vector3()).length();
      this.orbit.target.copy(center);
      this.camera.position.copy(center.clone().add(new THREE.Vector3(radius, -radius, radius * 0.9)));
      this.camera.zoom = Math.max(0.05, 130 / (radius * 1.5));
      this.camera.updateProjectionMatrix();
      this.orbit.update();
    }
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
    this.setMesh(null);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
