import { newId, type CadDocument, type Profile } from "./model";

export type SketchTool = "select" | "rectangle" | "circle" | "pan";
type Point = { x: number; y: number };
type Gesture =
  | { kind: "draw"; tool: "rectangle" | "circle"; from: Point; to: Point }
  | { kind: "pan"; from: Point; panX: number; panY: number };

export class SketchCanvas {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private doc: CadDocument;
  private selected: string | null = null;
  private tool: SketchTool = "select";
  private snapToGrid = true;
  private zoom = 4;
  private panX = 0;
  private panY = 0;
  private gesture: Gesture | null = null;
  private mounted = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    initial: CadDocument,
    private readonly onCreate: (profile: Profile) => void,
    private readonly onSelect: (id: string | null) => void
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is not supported");
    this.ctx = context;
    this.doc = initial;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    canvas.addEventListener("pointerdown", e => this.pointerDown(e));
    canvas.addEventListener("pointermove", e => this.pointerMove(e));
    canvas.addEventListener("pointerup", e => this.pointerUp(e));
    canvas.addEventListener("pointercancel", () => { this.gesture = null; this.draw(); });
    canvas.addEventListener("wheel", e => this.wheel(e), { passive: false });
    canvas.addEventListener("contextmenu", e => e.preventDefault());
  }

  setDocument(doc: CadDocument): void { this.doc = doc; this.draw(); }
  setSelected(id: string | null): void { this.selected = id; this.draw(); }
  setTool(tool: SketchTool): void {
    this.tool = tool;
    this.canvas.style.cursor = tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair";
    this.gesture = null;
    this.draw();
  }
  setSnap(enabled: boolean): void { this.snapToGrid = enabled; this.draw(); }
  getZoom(): number { return this.zoom; }
  dispose(): void { this.observer.disconnect(); }

  private resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const dpi = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * dpi);
    this.canvas.height = Math.round(height * dpi);
    if (!this.mounted) {
      this.panX = width / 2;
      this.panY = height / 2;
      this.mounted = true;
    }
    this.ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
    this.draw();
  }

  private screen(e: PointerEvent | WheelEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  private world(point: Point): Point {
    return { x: (point.x - this.panX) / this.zoom, y: (this.panY - point.y) / this.zoom };
  }
  private screenFromWorld(point: Point): Point {
    return { x: this.panX + point.x * this.zoom, y: this.panY - point.y * this.zoom };
  }
  private snapped(point: Point): Point {
    if (!this.snapToGrid) return point;
    return { x: Math.round(point.x / 5) * 5, y: Math.round(point.y / 5) * 5 };
  }
  private hit(point: Point): string | null {
    for (let i = this.doc.profiles.length - 1; i >= 0; i--) {
      const p = this.doc.profiles[i];
      if (p.kind === "rectangle") {
        if (point.x >= p.x && point.x <= p.x + p.width &&
            point.y >= p.y && point.y <= p.y + p.height) return p.id;
      } else {
        if (Math.hypot(point.x - p.x, point.y - p.y) <= p.radius) return p.id;
      }
    }
    return null;
  }

  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 1) return;
    this.canvas.setPointerCapture(event.pointerId);
    const point = this.screen(event);
    if (this.tool === "pan" || event.button === 1) {
      this.gesture = { kind: "pan", from: point, panX: this.panX, panY: this.panY };
    } else if (this.tool === "select") {
      this.onSelect(this.hit(this.world(point)));
    } else {
      const from = this.snapped(this.world(point));
      this.gesture = { kind: "draw", tool: this.tool, from, to: from };
    }
    this.draw();
  }
  private pointerMove(event: PointerEvent): void {
    const g = this.gesture;
    if (!g) return;
    const point = this.screen(event);
    if (g.kind === "pan") {
      this.panX = g.panX + point.x - g.from.x;
      this.panY = g.panY + point.y - g.from.y;
    } else {
      g.to = this.snapped(this.world(point));
    }
    this.draw();
  }
  private pointerUp(event: PointerEvent): void {
    if (!this.gesture) return;
    const g = this.gesture;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.gesture = null;
    if (g.kind === "draw") {
      const to = this.snapped(this.world(this.screen(event)));
      if (g.tool === "rectangle") {
        const width = Math.abs(to.x - g.from.x);
        const height = Math.abs(to.y - g.from.y);
        if (width >= 0.01 && height >= 0.01) {
          this.onCreate({ kind: "rectangle", id: newId("rect"),
            x: Math.min(to.x, g.from.x), y: Math.min(to.y, g.from.y), width, height });
        }
      } else {
        const radius = Math.hypot(to.x - g.from.x, to.y - g.from.y);
        if (radius >= 0.01) {
          this.onCreate({ kind: "circle", id: newId("circle"),
            x: g.from.x, y: g.from.y, radius });
        }
      }
    }
    this.draw();
  }
  private wheel(event: WheelEvent): void {
    event.preventDefault();
    const point = this.screen(event);
    const before = this.zoom;
    const scale = Math.exp(-event.deltaY * 0.001);
    this.zoom = Math.max(0.15, Math.min(160, this.zoom * scale));
    const ratio = this.zoom / before;
    this.panX = point.x - (point.x - this.panX) * ratio;
    this.panY = point.y - (point.y - this.panY) * ratio;
    this.draw();
  }

  private grid(width: number, height: number): void {
    const ctx = this.ctx;
    const wantedPx = 18;
    const step = 5 * Math.pow(10, Math.max(0, Math.ceil(Math.log10(wantedPx / (5 * this.zoom)))));
    const min = this.world({ x: 0, y: height });
    const max = this.world({ x: width, y: 0 });
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#1b3046";
    ctx.beginPath();
    for (let x = Math.ceil(min.x / step) * step; x <= max.x; x += step) {
      const s = this.screenFromWorld({ x, y: 0 });
      ctx.moveTo(Math.round(s.x) + 0.5, 0);
      ctx.lineTo(Math.round(s.x) + 0.5, height);
    }
    for (let y = Math.ceil(min.y / step) * step; y <= max.y; y += step) {
      const s = this.screenFromWorld({ x: 0, y });
      ctx.moveTo(0, Math.round(s.y) + 0.5);
      ctx.lineTo(width, Math.round(s.y) + 0.5);
    }
    ctx.stroke();
    ctx.strokeStyle = "#3b5269";
    ctx.beginPath();
    ctx.moveTo(this.panX, 0); ctx.lineTo(this.panX, height);
    ctx.moveTo(0, this.panY); ctx.lineTo(width, this.panY);
    ctx.stroke();
  }

  private paintProfile(profile: Profile, selected: boolean, preview = false): void {
    const ctx = this.ctx;
    ctx.lineWidth = selected ? 2.6 : 1.7;
    ctx.strokeStyle = preview ? "#eead63" : selected ? "#f2b260" : "#6babf2";
    ctx.fillStyle = selected ? "#f2b26026" : "#6babf21c";
    ctx.setLineDash(preview ? [6, 4] : []);
    ctx.beginPath();
    let centre: Point;
    if (profile.kind === "rectangle") {
      const a = this.screenFromWorld({ x: profile.x, y: profile.y + profile.height });
      const w = profile.width * this.zoom;
      const h = profile.height * this.zoom;
      ctx.rect(a.x, a.y, w, h);
      centre = this.screenFromWorld({ x: profile.x + profile.width / 2, y: profile.y + profile.height / 2 });
    } else {
      centre = this.screenFromWorld({ x: profile.x, y: profile.y });
      ctx.arc(centre.x, centre.y, profile.radius * this.zoom, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = selected ? "#ffd9a5" : "#9cc5f2";
    ctx.textAlign = "center";
    ctx.font = "11px ui-monospace, SFMono-Regular, Consolas, monospace";
    const label = profile.kind === "rectangle"
      ? profile.width.toFixed(2) + " × " + profile.height.toFixed(2)
      : "Ø " + (2 * profile.radius).toFixed(2);
    ctx.fillText(label, centre.x, centre.y + 4);
  }

  draw(): void {
    const dpi = Math.min(3, window.devicePixelRatio || 1);
    const width = this.canvas.width / dpi;
    const height = this.canvas.height / dpi;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0b1422";
    ctx.fillRect(0, 0, width, height);
    this.grid(width, height);
    for (const profile of this.doc.profiles) {
      this.paintProfile(profile, profile.id === this.selected);
    }
    if (this.gesture?.kind === "draw") {
      const { from, to, tool } = this.gesture;
      if (tool === "rectangle") {
        this.paintProfile({ kind: "rectangle", id: "preview", x: Math.min(from.x, to.x),
          y: Math.min(from.y, to.y), width: Math.abs(from.x - to.x), height: Math.abs(from.y - to.y) }, false, true);
      } else {
        this.paintProfile({ kind: "circle", id: "preview", x: from.x, y: from.y,
          radius: Math.hypot(to.x - from.x, to.y - from.y) }, false, true);
      }
    }
    ctx.fillStyle = "#8ca3bb";
    ctx.font = "11px ui-monospace, SFMono-Regular, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillText("XY   ·   " + this.zoom.toFixed(2) + " px/mm", 12, height - 12);
  }
}
