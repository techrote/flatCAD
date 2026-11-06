import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { GeometryMesh } from "./kernel-protocol";

/** OpenCascade B-rep-derived triangle display; never used for manufacturing geometry. */
export class Preview {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly orbit: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private object: THREE.Group | null = null;
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
    const axes = new THREE.AxesHelper(35);
    this.scene.add(axes);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate();
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

  setMesh(mesh: GeometryMesh | null): void {
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
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.vertices, 3));
    geometry.setIndex(mesh.triangles);
    if (mesh.normals.length === mesh.vertices.length) {
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normals, 3));
    } else {
      geometry.computeVertexNormals();
    }
    group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: 0x6aacf4, metalness: 0.2, roughness: 0.58, side: THREE.DoubleSide
    })));
    if (mesh.edgeLines.length) {
      const lines = new THREE.BufferGeometry();
      lines.setAttribute("position", new THREE.Float32BufferAttribute(mesh.edgeLines, 3));
      group.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0x152a45 })));
    }
    this.scene.add(group);
    this.object = group;
    const bounds = new THREE.Box3().setFromObject(group);
    if (!bounds.isEmpty()) {
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
    this.setMesh(null);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
