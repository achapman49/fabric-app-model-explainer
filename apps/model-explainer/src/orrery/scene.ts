/**
 * The three.js orrery. Imperative on purpose: one class owns the renderer, camera, controls, meshes and the HTML
 * labels, and React drives it through a handful of setters (data, looks, theme, focus, motion). Lazy-loaded with
 * OrreryCanvas so the first paint never waits for three.js.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
  bodyPosition,
  kindShort,
  moonPosition,
  neighbours,
  orbitCentre,
  parseObjectId,
  tableId,
  type Orrery,
  type OrreryBody,
  type OrreryMoon,
  type OrreryTrail,
} from '../domain/orrery';
import type { BodyLook, Looks, Paint } from './look';
import { dashedRingTexture, dotTexture, glowTexture, planetTexture, ringBandsTexture, ringTexture } from './textures';

export interface SceneTheme {
  dark: boolean;
  /** Resolve a paint (CSS custom property name) to a CSS colour. */
  resolve(p: Paint): string;
}

export interface SceneCallbacks {
  onPick(id: string | null): void;
  onHover?(id: string | null): void;
  onReady?(): void;
  onError?(message: string): void;
}

interface BodyNode {
  body: OrreryBody;
  group: THREE.Group;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial | THREE.ShaderMaterial;
  atmo: THREE.Mesh | null;
  glow: THREE.Sprite | null;
  corona: THREE.Sprite | null;
  light: THREE.PointLight | null;
  ghostRing: THREE.Sprite;
  flare: THREE.Sprite;
  arcTrack: THREE.Mesh;
  arc: THREE.Mesh;
  arcValue: number;
  ring: THREE.Mesh | null;
  orbit: THREE.LineLoop | null;
  label: HTMLButtonElement;
  labelSize: { w: number; h: number } | null;
  look: BodyLook | null;
  scale: number;
  dim: number;
  pos: THREE.Vector3;
}

interface TrailNode {
  trail: OrreryTrail;
  lines: THREE.Line[];
  curves: { a: THREE.Vector3; c: THREE.Vector3; b: THREE.Vector3 }[];
  paint: Paint;
  strong: boolean;
}

const SEGMENTS = 36;
const MOON_R = 0.21;
const UP = new THREE.Vector3(0, 1, 0);
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

const SUN_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vView;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vPos = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const ATMO_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const ATMO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float rim = 1.0 - abs(dot(vNormal, vView));
  float a = pow(rim, 2.2) * uOpacity;
  gl_FragColor = vec4(uColor, a);
}`;

const SUN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uTime;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vView;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  float n = noise(vPos * 2.6 + uTime * 0.12) * 0.6 + noise(vPos * 6.5 - uTime * 0.08) * 0.4;
  float rim = 1.0 - max(dot(vNormal, vView), 0.0);
  vec3 col = mix(uCore, uColor, clamp(smoothstep(0.0, 0.95, rim) * 0.8 + (n - 0.5) * 0.5, 0.0, 1.0));
  col += uColor * pow(rim, 3.0) * 0.5;
  gl_FragColor = vec4(col, uOpacity);
}`;

export class OrreryScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private host: HTMLElement;
  private labelsHost: HTMLElement;
  private cb: SceneCallbacks;
  private raf = 0;
  private last = performance.now();
  private time = 0;
  private reduced = false;
  private paused = false;
  private theme: SceneTheme = { dark: false, resolve: () => '#888888' };
  private colorCache = new Map<string, THREE.Color>();

  private orrery: Orrery | null = null;
  private looks: Looks | null = null;
  private world = new THREE.Group();
  private bodies = new Map<string, BodyNode>();
  private trails: TrailNode[] = [];
  private moonSolid: THREE.InstancedMesh | null = null;
  private moonGhost: THREE.InstancedMesh | null = null;
  private moonIndex: { moon: OrreryMoon; mesh: 'solid' | 'ghost'; i: number }[] = [];
  private moonLabels = new Map<string, HTMLButtonElement>();
  private particles: THREE.Points | null = null;
  private particleSpec: { trail: number; reverse: boolean; offset: number; lane: number }[] = [];
  private stars: THREE.Points | null = null;
  private grid: THREE.LineSegments | null = null;
  private focusRing: THREE.Sprite;
  private ambient = new THREE.AmbientLight(0xffffff, 0.5);
  private camLight = new THREE.DirectionalLight(0xffffff, 0.35);

  private tex = {
    glow: glowTexture(),
    ring: ringTexture(0.03),
    focus: ringTexture(0.022, false),
    dashed: dashedRingTexture(),
    dot: dotTexture(),
    bands: ringBandsTexture(),
  };
  private sphere = new THREE.SphereGeometry(1, 48, 32);
  private moonSphere = new THREE.SphereGeometry(1, 16, 12);
  private planetTex = new Map<string, THREE.Texture>();

  private focus: string | null = null;
  private related: Set<string> | null = null;
  private hovered: string | null = null;
  private flight: { from: THREE.Vector3; fromTarget: THREE.Vector3; dist: number; dir: THREE.Vector3; t0: number; dur: number } | null = null;
  private follow: THREE.Vector3 | null = null;
  private sideOffset = 0;
  /** Floating panels over the stage (title, legend, lens bar, Today, controls) in canvas pixels. */
  private overlays: { l: number; t: number; r: number; b: number }[] = [];
  private overlayKey = '';
  private dataAt = 0;
  private frame = 0;
  private ready = false;
  private size = { w: 1, h: 1 };
  private pointer = { x: 0, y: 0, down: null as null | { x: number; y: number }, inside: false };
  private raycaster = new THREE.Raycaster();
  private ro: ResizeObserver | null = null;
  private disposed = false;
  /** The camera was moved by hand: stop re-fitting the overview on resize. */
  private userMoved = false;

  constructor(host: HTMLElement, labelsHost: HTMLElement, cb: SceneCallbacks) {
    this.host = host;
    this.labelsHost = labelsHost;
    this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = 'absolute inset-0 block h-full w-full touch-none outline-none';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    host.prepend(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 6000);
    this.camera.add(this.camLight);
    this.camLight.position.set(0.3, 1, 0.2);
    this.scene.add(this.camera, this.ambient, this.world);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.9;
    this.controls.minDistance = 2.5;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.addEventListener('start', () => {
      this.flight = null;
      this.userMoved = true;
    });

    this.focusRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.focus, transparent: true, depthWrite: false, depthTest: false }));
    this.focusRing.visible = false;
    this.focusRing.renderOrder = 10;
    this.scene.add(this.focusRing);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('webglcontextlost', this.onLost);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.loop();
  }

  /* ------------------------------------------------------------ public API */

  setTheme(theme: SceneTheme) {
    this.theme = theme;
    this.colorCache.clear();
    this.ambient.intensity = theme.dark ? 0.45 : 1.5;
    this.camLight.intensity = theme.dark ? 0.5 : 0.9;
    this.buildStars();
    this.buildGrid();
    for (const n of this.bodies.values()) this.applyBodyColours(n);
    this.applyLooks();
  }

  setMotion(reduced: boolean, paused: boolean) {
    this.reduced = reduced;
    this.paused = paused;
    if (this.particles) this.particles.visible = !reduced;
  }

  setData(orrery: Orrery) {
    this.clearWorld();
    this.userMoved = false;
    this.dataAt = performance.now();
    this.orrery = orrery;
    for (const b of orrery.bodies) this.bodies.set(b.id, this.makeBody(b));
    this.buildMoons();
    this.buildTrails();
    this.buildGrid();
    this.controls.maxDistance = Math.max(60, orrery.extent * 5);
    if (this.focus && !this.positionOf(this.focus)) this.focus = null;
    this.updateRelated();
    this.applyLooks();
    this.overview(true);
  }

  setLooks(looks: Looks) {
    this.looks = looks;
    this.applyLooks();
  }

  setFocus(id: string | null, fly = true) {
    if (id && !this.positionOf(id)) id = null;
    const changed = id !== this.focus;
    this.focus = id;
    this.updateRelated();
    this.syncMoonLabels();
    for (const n of this.bodies.values()) {
      const on = id === n.body.id;
      n.label.toggleAttribute('data-focus', on);
      if (on) n.label.setAttribute('aria-current', 'true');
      else n.label.removeAttribute('aria-current');
    }
    if (!changed && !fly) return;
    if (!id) this.overview(this.reduced);
    else this.flyTo(id);
  }

  /** Back to the whole sky. */
  overview(instant = false) {
    const o = this.orrery;
    if (!o) return;
    this.follow = null;
    // Fit the systems' bounding box (seen from above at an angle, depth reads shorter than width).
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const s of o.systems) {
      minX = Math.min(minX, s.centre.x - s.extent);
      maxX = Math.max(maxX, s.centre.x + s.extent);
      minZ = Math.min(minZ, s.centre.z - s.extent);
      maxZ = Math.max(maxZ, s.centre.z + s.extent);
    }
    const centre = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const dir = new THREE.Vector3(0, 0.8, 1).normalize();
    // Bisect the camera distance until every system's rim projects inside the stage and clear of the floating
    // panels (the view offset already centres the projection in the free area between them).
    const rims: THREE.Vector3[] = [];
    for (const s of o.systems)
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        rims.push(new THREE.Vector3(s.centre.x + Math.cos(a) * s.extent, 0, s.centre.z + Math.sin(a) * s.extent));
      }
    for (const bd of o.bodies) {
      const sys = o.systems[bd.system];
      if (bd.kind === 'sun' || bd.kind === 'shared') rims.push(new THREE.Vector3(sys.centre.x + bd.anchor.x, 1.5, sys.centre.z + bd.anchor.z));
    }
    const probe = this.camera.clone();
    const { w, h } = this.size;
    const margin = w > 600 ? 12 : 26;
    const pad = 6;
    const v = new THREE.Vector3();
    const fits = (d: number) => {
      probe.position.copy(centre).addScaledVector(dir, d);
      probe.lookAt(centre);
      probe.updateMatrixWorld();
      probe.updateProjectionMatrix();
      return rims.every((c) => {
        v.copy(c).project(probe);
        if (v.z >= 1) return false;
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        if (x < margin || y < margin || x > w - margin - (w > 600 ? this.sideOffset : 0) || y > h - margin) return false;
        return !this.overlays.some((r) => x > r.l - pad && x < r.r + pad && y > r.t - pad && y < r.b + pad);
      });
    };
    let lo = 4;
    let hi = Math.max(40, (maxX - minX + maxZ - minZ) * 6);
    if (!fits(hi)) hi *= 2;
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    const dist = Math.max(12, hi);
    this.startFlight(centre, dist, dir, instant);
  }

  zoom(factor: number) {
    const t = this.controls.target;
    const off = this.camera.position.clone().sub(t).multiplyScalar(factor);
    const len = THREE.MathUtils.clamp(off.length(), this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(t).add(off.setLength(len));
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointerleave', this.onLeave);
    el.removeEventListener('webglcontextlost', this.onLost);
    this.clearWorld();
    this.stars?.geometry.dispose();
    this.grid?.geometry.dispose();
    Object.values(this.tex).forEach((t) => t.dispose());
    this.sphere.dispose();
    this.moonSphere.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    el.remove();
  }

  /* ------------------------------------------------------------ build */

  private color(p: Paint): THREE.Color {
    let c = this.colorCache.get(p);
    if (!c) {
      c = new THREE.Color();
      try {
        c.setStyle(this.theme.resolve(p) || '#888888');
      } catch {
        c.set('#888888');
      }
      this.colorCache.set(p, c);
    }
    return c;
  }

  private clearWorld() {
    for (const n of this.bodies.values()) {
      n.label.remove();
      n.material.dispose();
      (n.atmo?.material as THREE.Material | undefined)?.dispose();
      (n.glow?.material as THREE.Material | undefined)?.dispose();
      (n.corona?.material as THREE.Material | undefined)?.dispose();
      (n.ghostRing.material as THREE.Material).dispose();
      (n.flare.material as THREE.Material).dispose();
      n.arc.geometry.dispose();
      n.arcTrack.geometry.dispose();
      (n.arc.material as THREE.Material).dispose();
      (n.arcTrack.material as THREE.Material).dispose();
      n.ring?.geometry.dispose();
      (n.ring?.material as THREE.Material | undefined)?.dispose();
      n.orbit?.geometry.dispose();
      (n.orbit?.material as THREE.Material | undefined)?.dispose();
    }
    this.bodies.clear();
    for (const t of this.trails) for (const l of t.lines) {
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    }
    this.trails = [];
    for (const m of [this.moonSolid, this.moonGhost]) {
      if (!m) continue;
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
    this.moonSolid = this.moonGhost = null;
    this.moonIndex = [];
    for (const l of this.moonLabels.values()) l.remove();
    this.moonLabels.clear();
    if (this.particles) {
      this.particles.geometry.dispose();
      (this.particles.material as THREE.Material).dispose();
      this.particles = null;
    }
    this.planetTex.forEach((t) => t.dispose());
    this.planetTex.clear();
    this.world.clear();
  }

  private makeLabel(text: string, kind: string, id: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'orrery-label';
    b.dataset.kind = kind;
    b.setAttribute('data-testid', id.startsWith('m:') ? 'moon-label' : 'body-label');
    b.dataset.body = id.startsWith('t:') ? id.slice(2) : id;
    const name = document.createElement('span');
    name.className = 'orrery-label-name';
    name.textContent = text;
    const cap = document.createElement('span');
    cap.className = 'orrery-label-cap';
    b.append(name, cap);
    b.style.visibility = 'hidden';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cb.onPick(id);
    });
    b.addEventListener('pointerenter', () => this.setHover(id));
    b.addEventListener('pointerleave', () => this.setHover(null));
    this.labelsHost.append(b);
    return b;
  }

  private makeBody(b: OrreryBody): BodyNode {
    const group = new THREE.Group();
    const sun = b.kind === 'sun';
    let material: THREE.MeshStandardMaterial | THREE.ShaderMaterial;
    if (sun) {
      material = new THREE.ShaderMaterial({
        vertexShader: SUN_VERT,
        fragmentShader: SUN_FRAG,
        uniforms: { uColor: { value: new THREE.Color() }, uCore: { value: new THREE.Color() }, uTime: { value: 0 }, uOpacity: { value: 1 } },
        transparent: true,
      });
    } else {
      let map = this.planetTex.get(b.name);
      if (!map) {
        map = planetTexture(b.name);
        this.planetTex.set(b.name, map);
      }
      material = new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0.02, transparent: true });
    }
    const mesh = new THREE.Mesh(this.sphere, material);
    mesh.userData.id = b.id;
    mesh.rotation.z = 0.25 + (b.tilt || 0) * 3;
    group.add(mesh);

    let glow: THREE.Sprite | null = null;
    let corona: THREE.Sprite | null = null;
    let light: THREE.PointLight | null = null;
    let atmo: THREE.Mesh | null = null;
    if (!sun) {
      atmo = new THREE.Mesh(
        this.sphere,
        new THREE.ShaderMaterial({
          vertexShader: ATMO_VERT,
          fragmentShader: ATMO_FRAG,
          uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0.6 } },
          transparent: true,
          depthWrite: false,
          side: THREE.FrontSide,
        }),
      );
      atmo.raycast = () => {};
      group.add(atmo);
    }
    if (sun) {
      glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, transparent: true, depthWrite: false }));
      corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, transparent: true, depthWrite: false }));
      group.add(glow, corona);
      light = new THREE.PointLight(0xffffff, 2.4, 0, 0);
      group.add(light);
    }
    const ghostRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.dashed, transparent: true, depthWrite: false }));
    ghostRing.visible = false;
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.ring, transparent: true, depthWrite: false }));
    flare.visible = false;
    const arcTrack = new THREE.Mesh(new THREE.RingGeometry(1.32, 1.42, 64), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    const arc = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.44, 64, 1, Math.PI / 2, 0.001), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    arcTrack.visible = arc.visible = false;
    group.add(ghostRing, flare, arcTrack, arc);

    let ring: THREE.Mesh | null = null;
    if (!sun && (b.columns ?? 0) > 40) {
      const geo = new THREE.RingGeometry(1.45, 2.25, 96, 1);
      // Map the band texture across the ring's radius.
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getX(i), pos.getY(i));
        uv.setXY(i, (r - 1.45) / 0.8, 0.5);
      }
      ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.tex.bands, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2 + 0.42;
      ring.rotation.y = 0.18;
      group.add(ring);
    }

    let orbit: THREE.LineLoop | null = null;
    if ((b.kind === 'planet' || b.kind === 'rogue') && b.orbit > 0) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 160; i++) {
        const a = (i / 160) * Math.PI * 2;
        const c = Math.cos(a) * b.orbit;
        const s = Math.sin(a) * b.orbit;
        pts.push(new THREE.Vector3(c, s * Math.sin(b.tilt), s * Math.cos(b.tilt)));
      }
      orbit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
      const c = orbitCentre(this.orrery!, b);
      orbit.position.set(c.x, c.y, c.z);
      // Rogues share one ring: draw it once.
      if (b.kind === 'rogue' && this.orrery!.systems[b.system].bodies[0] !== b.name) orbit.visible = false;
      this.world.add(orbit);
    }

    this.world.add(group);
    const node: BodyNode = {
      body: b,
      group,
      mesh,
      material,
      atmo,
      glow,
      corona,
      light,
      ghostRing,
      flare,
      arcTrack,
      arc,
      arcValue: -1,
      ring,
      orbit,
      label: this.makeLabel(b.name, b.kind, b.id),
      labelSize: null,
      look: null,
      scale: 1,
      dim: 1,
      pos: new THREE.Vector3(),
    };
    node.label.setAttribute('aria-label', `${b.name}, ${kindShort(b)}${b.hidden ? ', hidden' : ''}. Fly to it.`);
    this.applyBodyColours(node);
    return node;
  }

  private applyBodyColours(n: BodyNode) {
    const accent = this.color('--accent-9');
    if (n.body.kind === 'sun') {
      const u = (n.material as THREE.ShaderMaterial).uniforms;
      u.uColor.value.copy(accent);
      u.uCore.value.copy(new THREE.Color(this.theme.dark ? '#f4fdff' : '#ffffff').lerp(accent, this.theme.dark ? 0.18 : 0.32));
      const gm = n.glow!.material as THREE.SpriteMaterial;
      const cm = n.corona!.material as THREE.SpriteMaterial;
      gm.color.copy(accent);
      cm.color.copy(accent);
      gm.blending = cm.blending = this.theme.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      gm.opacity = this.theme.dark ? 0.9 : 0.55;
      cm.opacity = this.theme.dark ? 0.32 : 0.22;
      gm.needsUpdate = cm.needsUpdate = true;
      n.light!.color.copy(new THREE.Color('#ffffff').lerp(accent, 0.25));
      n.light!.intensity = this.theme.dark ? 3.2 : 2.4;
    }
    const ink = this.color(this.theme.dark ? '--gray-12' : '--gray-12');
    if (n.orbit) (n.orbit.material as THREE.LineBasicMaterial).color.copy(ink);
    (n.ghostRing.material as THREE.SpriteMaterial).color.copy(this.color('--gray-9'));
    (n.arcTrack.material as THREE.MeshBasicMaterial).color.copy(this.color('--gray-8'));
    if (n.ring) (n.ring.material as THREE.MeshBasicMaterial).color.copy(this.color(this.theme.dark ? '--gray-10' : '--gray-9'));
  }

  private buildMoons() {
    const o = this.orrery!;
    const solid = o.moons.filter((m) => !m.hidden);
    const ghost = o.moons.filter((m) => m.hidden);
    const make = (count: number, opacity: number) => {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, transparent: opacity < 1, opacity, emissive: new THREE.Color(0x000000) });
      const mesh = new THREE.InstancedMesh(this.moonSphere, mat, Math.max(1, count));
      mesh.count = count;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.world.add(mesh);
      return mesh;
    };
    this.moonSolid = make(solid.length, 1);
    this.moonGhost = make(ghost.length, 0.3);
    this.moonIndex = [...solid.map((moon, i) => ({ moon, mesh: 'solid' as const, i })), ...ghost.map((moon, i) => ({ moon, mesh: 'ghost' as const, i }))];
  }

  private buildTrails() {
    const o = this.orrery!;
    for (const t of o.trails) {
      const lanes = t.both ? 2 : 1;
      const lines: THREE.Line[] = [];
      const curves: TrailNode['curves'] = [];
      for (let k = 0; k < lanes; k++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3));
        const mat = t.active
          ? new THREE.LineBasicMaterial({ transparent: true, depthWrite: false })
          : new THREE.LineDashedMaterial({ transparent: true, depthWrite: false, dashSize: 0.55, gapSize: 0.4 });
        const line = new THREE.Line(geo, mat);
        line.frustumCulled = false;
        line.userData.id = t.id;
        this.world.add(line);
        lines.push(line);
        curves.push({ a: new THREE.Vector3(), c: new THREE.Vector3(), b: new THREE.Vector3() });
      }
      this.trails.push({ trail: t, lines, curves, paint: '--gray-9', strong: false });
    }
    // Flow particles travel toward the table being filtered.
    this.particleSpec = [];
    this.trails.forEach((tn, ti) => {
      const t = tn.trail;
      const dirs: { reverse: boolean; lane: number }[] = [];
      if (t.both) dirs.push({ reverse: false, lane: 0 }, { reverse: true, lane: 1 });
      else if (t.towardTo) dirs.push({ reverse: false, lane: 0 });
      else dirs.push({ reverse: true, lane: 0 });
      for (const d of dirs) for (const offset of [0, 0.5]) this.particleSpec.push({ trail: ti, reverse: d.reverse, offset: offset + ti * 0.13, lane: d.lane });
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, this.particleSpec.length) * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Math.max(1, this.particleSpec.length) * 3), 3));
    geo.setDrawRange(0, this.particleSpec.length);
    const mat = new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, map: this.tex.dot, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.95 });
    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false;
    this.particles.visible = !this.reduced;
    this.world.add(this.particles);
  }

  private buildStars() {
    if (this.stars) {
      this.scene.remove(this.stars);
      this.stars.geometry.dispose();
      (this.stars.material as THREE.Material).dispose();
    }
    const n = 1600;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const base = new THREE.Color(this.theme.dark ? '#ffffff' : this.theme.resolve('--gray-11') || '#666666');
    const tint = this.color('--accent-9');
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const r = 900 + rnd() * 900;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * s * r, u * r * 0.7 + 120, Math.sin(a) * s * r], i * 3);
      const c = base.clone().lerp(tint, rnd() < 0.18 ? 0.5 : 0).multiplyScalar(0.45 + rnd() * 0.55);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: this.theme.dark ? 2.2 : 1.8,
      sizeAttenuation: false,
      map: this.tex.dot,
      vertexColors: true,
      transparent: true,
      opacity: this.theme.dark ? 0.9 : 0.4,
      depthWrite: false,
    });
    this.stars = new THREE.Points(geo, mat);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  /** A faint polar grid under each system: the chart the orrery is drawn on. */
  private buildGrid() {
    if (this.grid) {
      this.world.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as THREE.Material).dispose();
      this.grid = null;
    }
    const o = this.orrery;
    if (!o) return;
    const pts: number[] = [];
    for (const s of o.systems) {
      const R = s.extent;
      const step = Math.min(6, R * 0.25);
      // The system's edge as a dotted ring.
      for (let i = 0; i < 120; i += 2) {
        const a0 = (i / 120) * Math.PI * 2;
        const a1 = ((i + 1) / 120) * Math.PI * 2;
        pts.push(s.centre.x + Math.cos(a0) * R, -0.6, s.centre.z + Math.sin(a0) * R, s.centre.x + Math.cos(a1) * R, -0.6, s.centre.z + Math.sin(a1) * R);
      }
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        pts.push(s.centre.x + Math.cos(a) * step, -0.6, s.centre.z + Math.sin(a) * step, s.centre.x + Math.cos(a) * R, -0.6, s.centre.z + Math.sin(a) * R);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: this.color('--gray-12'), transparent: true, opacity: this.theme.dark ? 0.08 : 0.1, depthWrite: false });
    this.grid = new THREE.LineSegments(geo, mat);
    this.grid.frustumCulled = false;
    this.world.add(this.grid);
  }

  /* ------------------------------------------------------------ looks */

  private updateRelated() {
    const o = this.orrery;
    if (!o || !this.focus) {
      this.related = null;
      return;
    }
    const ref = parseObjectId(this.focus);
    if (!ref) return;
    if (ref.kind === 'relationship') {
      const t = o.trails.find((x) => x.index === ref.index);
      this.related = new Set(t ? [t.from, t.to] : []);
    } else this.related = neighbours(o, ref.table);
  }

  private applyLooks() {
    const looks = this.looks;
    const o = this.orrery;
    if (!looks || !o) return;
    for (const n of this.bodies.values()) {
      const look = looks.bodies.get(n.body.id) ?? null;
      n.look = look;
      if (!look) continue;
      if (n.body.kind !== 'sun') (n.material as THREE.MeshStandardMaterial).color.copy(this.color(look.paint));
      if (n.atmo) {
        const u = (n.atmo.material as THREE.ShaderMaterial).uniforms;
        u.uColor.value.copy(this.color(look.paint === '--gray-9' || look.paint === '--gray-11' ? '--accent-8' : look.paint));
        (n.atmo.material as THREE.ShaderMaterial).blending = this.theme.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      }
      n.ghostRing.visible = look.ghost;
      if (look.flare) (n.flare.material as THREE.SpriteMaterial).color.copy(this.color(look.flare === 'warn' ? '--warn-solid' : '--info-solid'));
      n.flare.visible = !!look.flare;
      if (look.arc) {
        const v = Math.max(0.001, Math.min(1, look.arc.value));
        if (Math.abs(v - n.arcValue) > 1e-4) {
          n.arc.geometry.dispose();
          n.arc.geometry = new THREE.RingGeometry(1.3, 1.46, 64, 1, Math.PI / 2, -v * Math.PI * 2);
          n.arcValue = v;
        }
        (n.arc.material as THREE.MeshBasicMaterial).color.copy(this.color(look.arc.paint));
      }
      n.arc.visible = n.arcTrack.visible = !!look.arc && look.arc.value > 0;
      n.arcTrack.visible = !!look.arc;
      const cap = n.label.querySelector('.orrery-label-cap') as HTMLElement;
      if (cap.textContent !== look.caption) {
        cap.textContent = look.caption;
        n.labelSize = null;
      }
    }
    // Moons
    const tmpColor = new THREE.Color();
    for (const e of this.moonIndex) {
      const look = looks.moons.get(e.moon.id);
      const mesh = e.mesh === 'solid' ? this.moonSolid! : this.moonGhost!;
      tmpColor.copy(this.color(look?.paint ?? '--gray-10'));
      mesh.setColorAt(e.i, tmpColor);
    }
    for (const m of [this.moonSolid, this.moonGhost]) if (m?.instanceColor) m.instanceColor.needsUpdate = true;
    for (const tn of this.trails) {
      const look = looks.trails.get(tn.trail.id);
      tn.paint = look?.paint ?? '--gray-9';
      tn.strong = look?.strong ?? false;
      for (const l of tn.lines) (l.material as THREE.LineBasicMaterial).color.copy(this.color(tn.paint));
    }
    this.focusRing.material.color.copy(this.color('--accent-9'));
  }

  /* ------------------------------------------------------------ camera */

  private positionOf(id: string): THREE.Vector3 | null {
    const o = this.orrery;
    if (!o) return null;
    const ref = parseObjectId(id);
    if (!ref) return null;
    if (ref.kind === 'table') {
      const n = this.bodies.get(tableId(ref.table));
      return n ? n.pos.clone() : null;
    }
    if (ref.kind === 'measure') {
      const m = o.moons.find((x) => x.id === id);
      if (!m) return null;
      const p = moonPosition(o, m, this.time);
      return new THREE.Vector3(p.x, p.y, p.z);
    }
    const t = this.trails.find((x) => x.trail.index === ref.index);
    if (!t) return null;
    const a = this.bodies.get(tableId(t.trail.from))!.pos;
    const b = this.bodies.get(tableId(t.trail.to))!.pos;
    return a.clone().add(b).multiplyScalar(0.5);
  }

  private distanceFor(id: string): number {
    const o = this.orrery!;
    const ref = parseObjectId(id)!;
    if (ref.kind === 'table') {
      const n = this.bodies.get(tableId(ref.table));
      const reach = n ? n.body.reach * Math.max(1, n.scale) : 2;
      return Math.max(24, reach * 10 + 15);
    }
    if (ref.kind === 'measure') return 9;
    const t = o.trails.find((x) => x.index === ref.index);
    if (!t) return 12;
    const a = this.bodies.get(tableId(t.from))!.pos;
    const b = this.bodies.get(tableId(t.to))!.pos;
    return Math.max(16, a.distanceTo(b) * 2.2 + 8);
  }

  private flyTo(id: string) {
    const p = this.positionOf(id);
    if (!p) return;
    const dir = this.camera.position.clone().sub(this.controls.target);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    dir.y = 0.9;
    dir.normalize();
    this.startFlight(p, this.distanceFor(id), dir, this.reduced);
  }

  private startFlight(target: THREE.Vector3, dist: number, dir: THREE.Vector3, instant: boolean) {
    if (instant) {
      this.flight = null;
      this.controls.target.copy(target);
      this.camera.position.copy(target).add(dir.clone().multiplyScalar(dist));
      this.follow = this.focus ? target.clone() : null;
      this.controls.update();
      return;
    }
    this.flight = { from: this.camera.position.clone(), fromTarget: this.controls.target.clone(), dist, dir: dir.clone(), t0: performance.now(), dur: 1300 };
    this.follow = null;
  }

  private stepCamera() {
    const goal = this.focus ? this.positionOf(this.focus) : new THREE.Vector3();
    if (this.flight && goal) {
      const f = this.flight;
      const k = ease(Math.min(1, (performance.now() - f.t0) / f.dur));
      const target = f.fromTarget.clone().lerp(goal, k);
      const desired = goal.clone().add(f.dir.clone().multiplyScalar(f.dist));
      // Arc slightly upward mid-flight so long flights read as travel, not a zoom.
      const lift = Math.sin(k * Math.PI) * f.from.distanceTo(desired) * 0.12;
      this.camera.position.copy(f.from).lerp(desired, k).add(new THREE.Vector3(0, lift, 0));
      this.controls.target.copy(target);
      if (k >= 1) {
        this.flight = null;
        this.follow = this.focus ? goal.clone() : null;
      }
    } else if (this.follow && goal) {
      const delta = goal.clone().sub(this.follow);
      this.camera.position.add(delta);
      this.controls.target.add(delta);
      this.follow.copy(goal);
    }
  }

  /* ------------------------------------------------------------ frame */

  private resize() {
    const r = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.readSideOffset(true);
    if (this.orrery && !this.focus && !this.userMoved) this.overview(true);
  }

  /**
   * Read the stage layout: the side panel width (StagePage sets --side-w) and the floating panels over the canvas.
   * The projection is centred in the free area between them, and the overview is re-fitted when they change.
   */
  private readSideOffset(force = false) {
    const raw = getComputedStyle(this.host).getPropertyValue('--side-w').trim();
    let px = 0;
    if (raw.startsWith('calc')) {
      const nums = raw.match(/[\d.]+px/g) ?? [];
      px = nums.reduce((s, x) => s + parseFloat(x), 0);
    } else px = parseFloat(raw) || 0;
    const { w, h } = this.size;
    const side = w > 600 ? px : 0;
    const box = this.host.getBoundingClientRect();
    const root = this.host.closest('.x-stage-root') ?? this.host.parentElement;
    const rects: { l: number; t: number; r: number; b: number }[] = [];
    for (const el of root ? Array.from(root.querySelectorAll<HTMLElement>('.x-glass, [data-stage-overlay]')) : []) {
      if (this.labelsHost.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const rect = { l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top };
      // Only what actually covers the canvas; the side panel is handled by the side offset.
      if (rect.r <= 0 || rect.b <= 0 || rect.l >= w || rect.t >= h) continue;
      if (side && rect.l >= w - side - 4) continue;
      rects.push(rect);
    }
    const key = `${side}|${w}x${h}|${rects.map((r) => `${Math.round(r.l)},${Math.round(r.t)},${Math.round(r.r)},${Math.round(r.b)}`).join(';')}`;
    if (!force && key === this.overlayKey) return;
    const changed = key !== this.overlayKey;
    this.overlayKey = key;
    this.overlays = rects;
    this.sideOffset = px;
    // Free area: right of nothing, left of the side panel; below panels hugging the top edge, above those hugging the bottom.
    const topBand = Math.max(0, ...rects.filter((r) => r.t < h * 0.25 && r.b < h * 0.5).map((r) => r.b));
    const bottomBand = Math.min(h, ...rects.filter((r) => r.b > h * 0.75 && r.t > h * 0.5).map((r) => r.t));
    const cx = (w - side) / 2;
    const cy = THREE.MathUtils.clamp((topBand + bottomBand) / 2, h * 0.35, h * 0.65);
    const offX = w / 2 - cx;
    const offY = h / 2 - cy;
    if (Math.abs(offX) > 0.5 || Math.abs(offY) > 0.5) this.camera.setViewOffset(w, h, offX, offY, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    // Panels settle just after load: re-fit instantly then, smoothly later (legend folded, side panel toggled).
    if (changed && !force && this.orrery && !this.focus && !this.userMoved) this.overview(this.reduced || performance.now() - this.dataAt < 1500);
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    try {
      this.tick();
    } catch (err) {
      cancelAnimationFrame(this.raf);
      this.cb.onError?.(err instanceof Error ? err.message : String(err));
    }
  };

  private tick() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.reduced && !this.paused) this.time += dt;
    this.frame++;
    if (this.frame % 30 === 0) this.readSideOffset();
    const o = this.orrery;
    const pulse = this.reduced ? 0.5 : (Math.sin(performance.now() / 520) + 1) / 2;
    if (o) {
      const t = this.time;
      for (const n of this.bodies.values()) {
        const p = bodyPosition(o, n.body, t);
        n.pos.set(p.x, p.y, p.z);
        n.group.position.copy(n.pos);
        const targetScale = n.look?.scale ?? 1;
        n.scale += (targetScale - n.scale) * (this.reduced ? 1 : 0.12);
        const r = n.body.radius * n.scale;
        n.mesh.scale.setScalar(r);
        n.mesh.rotation.y += this.reduced ? 0 : dt * 0.12;
        const related = !this.related || this.related.has(n.body.name);
        const dimTarget = related ? 1 : 0.32;
        n.dim += (dimTarget - n.dim) * (this.reduced ? 1 : 0.15);
        const ghost = n.look?.ghost ?? n.body.hidden;
        const alpha = (ghost ? 0.28 : 1) * n.dim;
        if (n.body.kind === 'sun') {
          const u = (n.material as THREE.ShaderMaterial).uniforms;
          u.uTime.value = this.time + performance.now() / 4000;
          u.uOpacity.value = alpha;
          n.glow!.scale.setScalar(r * 4.2);
          n.corona!.scale.setScalar(r * (8.5 + (this.reduced ? 0 : Math.sin(performance.now() / 1400) * 0.4)));
          (n.glow!.material as THREE.SpriteMaterial).opacity = (this.theme.dark ? 0.9 : 0.55) * n.dim * (ghost ? 0.4 : 1);
          (n.corona!.material as THREE.SpriteMaterial).opacity = (this.theme.dark ? 0.3 : 0.2) * n.dim * (ghost ? 0.4 : 1);
        } else {
          const m = n.material as THREE.MeshStandardMaterial;
          m.opacity = alpha;
          m.depthWrite = alpha > 0.9;
          if (n.atmo) {
            n.atmo.scale.setScalar(r * 1.14);
            (n.atmo.material as THREE.ShaderMaterial).uniforms.uOpacity.value = (this.theme.dark ? 0.75 : 0.55) * alpha;
          }
        }
        n.ghostRing.scale.setScalar(r * 2.7);
        (n.ghostRing.material as THREE.SpriteMaterial).opacity = 0.75 * n.dim;
        if (n.flare.visible) {
          n.flare.scale.setScalar(r * (2.7 + pulse * 0.5));
          (n.flare.material as THREE.SpriteMaterial).opacity = (0.55 + (1 - pulse) * 0.45) * n.dim;
        }
        for (const a of [n.arc, n.arcTrack]) {
          a.scale.setScalar(r);
          a.quaternion.copy(this.camera.quaternion);
        }
        (n.arc.material as THREE.MeshBasicMaterial).opacity = n.dim;
        (n.arcTrack.material as THREE.MeshBasicMaterial).opacity = 0.35 * n.dim;
        if (n.ring) {
          n.ring.scale.setScalar(r);
          (n.ring.material as THREE.MeshBasicMaterial).opacity = (this.theme.dark ? 0.55 : 0.7) * n.dim * (ghost ? 0.4 : 1);
        }
        if (n.orbit) {
          const focused = this.focus === n.body.id;
          const lm = n.orbit.material as THREE.LineBasicMaterial;
          lm.color.copy(focused ? this.color('--accent-9') : this.color('--gray-12'));
          lm.opacity = focused ? 0.7 : (this.theme.dark ? 0.1 : 0.14) * (this.related ? 0.6 : 1);
        }
      }
      this.updateMoons(o, t);
      this.updateTrails(pulse);
    }
    this.stepCamera();
    this.updateFocusRing(pulse);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
    if (!this.ready && o) {
      this.ready = true;
      this.cb.onReady?.();
    }
  }

  private updateMoons(o: Orrery, t: number) {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const focusTable = this.focusTable();
    for (const e of this.moonIndex) {
      const host = this.bodies.get(tableId(e.moon.table));
      if (!host) continue;
      // Moons keep their distance from the surface when a lens resizes the host.
      const grow = host.body.radius * (host.scale - 1);
      const pos = moonPosition(o, { ...e.moon, orbit: e.moon.orbit + grow }, t, host.pos);
      p.set(pos.x, pos.y, pos.z);
      const focused = this.focus === e.moon.id;
      const big = focused ? 1.9 : focusTable === e.moon.table ? 1.25 : 1;
      const dimmed = this.related && !this.related.has(e.moon.table) ? 0.6 : 1;
      s.setScalar(MOON_R * big * dimmed);
      m4.compose(p, q, s);
      (e.mesh === 'solid' ? this.moonSolid! : this.moonGhost!).setMatrixAt(e.i, m4);
      const label = this.moonLabels.get(e.moon.id);
      if (label) label.dataset.x = `${p.x},${p.y},${p.z}`;
    }
    for (const m of [this.moonSolid, this.moonGhost]) if (m) m.instanceMatrix.needsUpdate = true;
  }

  private updateTrails(pulse: number) {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const side = new THREE.Vector3();
    this.trails.forEach((tn) => {
      const na = this.bodies.get(tableId(tn.trail.from));
      const nb = this.bodies.get(tableId(tn.trail.to));
      if (!na || !nb) return;
      a.copy(na.pos);
      b.copy(nb.pos);
      const len = a.distanceTo(b);
      side.copy(b).sub(a).cross(UP);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const focusHit = this.focus === tn.trail.id || (this.focus?.startsWith('t:') && (this.focus === tableId(tn.trail.from) || this.focus === tableId(tn.trail.to)));
      const relatedOk = !this.related || (this.related.has(tn.trail.from) && this.related.has(tn.trail.to));
      tn.lines.forEach((line, k) => {
        const off = tn.lines.length === 2 ? (k === 0 ? -1 : 1) * Math.min(0.45, 0.12 + len * 0.012) : 0;
        const c = tn.curves[k];
        c.a.copy(a).addScaledVector(side, off * 0.6);
        c.b.copy(b).addScaledVector(side, off * 0.6);
        c.c.copy(a).add(b).multiplyScalar(0.5).addScaledVector(UP, len * 0.09).addScaledVector(side, off * 1.6);
        const attr = line.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i <= SEGMENTS; i++) {
          const u = i / SEGMENTS;
          const w0 = (1 - u) * (1 - u);
          const w1 = 2 * (1 - u) * u;
          const w2 = u * u;
          attr.setXYZ(i, c.a.x * w0 + c.c.x * w1 + c.b.x * w2, c.a.y * w0 + c.c.y * w1 + c.b.y * w2, c.a.z * w0 + c.c.z * w1 + c.b.z * w2);
        }
        attr.needsUpdate = true;
        if (!tn.trail.active) line.computeLineDistances();
        line.geometry.computeBoundingSphere();
        const mat = line.material as THREE.LineBasicMaterial;
        const base = tn.strong ? 0.6 + pulse * 0.35 : this.theme.dark ? 0.42 : 0.5;
        mat.opacity = focusHit ? 1 : relatedOk ? base : 0.08;
        mat.color.copy(focusHit && !tn.strong ? this.color('--accent-9') : this.color(tn.paint));
      });
    });
    const parts = this.particles;
    if (!parts) return;
    const pos = parts.geometry.attributes.position as THREE.BufferAttribute;
    const col = parts.geometry.attributes.color as THREE.BufferAttribute;
    const dimCol = this.color('--gray-8');
    this.particleSpec.forEach((sp, i) => {
      const tn = this.trails[sp.trail];
      const c = tn.curves[sp.lane] ?? tn.curves[0];
      const len = Math.max(1, c.a.distanceTo(c.b));
      let u = (this.time * (2.4 / len) + sp.offset) % 1;
      if (sp.reverse) u = 1 - u;
      const w0 = (1 - u) * (1 - u);
      const w1 = 2 * (1 - u) * u;
      const w2 = u * u;
      pos.setXYZ(i, c.a.x * w0 + c.c.x * w1 + c.b.x * w2, c.a.y * w0 + c.c.y * w1 + c.b.y * w2, c.a.z * w0 + c.c.z * w1 + c.b.z * w2);
      const relatedOk = !this.related || (this.related.has(tn.trail.from) && this.related.has(tn.trail.to));
      const cc = relatedOk ? (tn.strong ? this.color(tn.paint) : this.color('--accent-9')) : dimCol;
      col.setXYZ(i, cc.r, cc.g, cc.b);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
    (parts.material as THREE.PointsMaterial).blending = this.theme.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
  }

  private focusTable(): string | null {
    if (!this.focus) return null;
    const ref = parseObjectId(this.focus);
    return ref && ref.kind !== 'relationship' ? ref.table : null;
  }

  private updateFocusRing(pulse: number) {
    const id = this.focus;
    if (!id) {
      this.focusRing.visible = false;
      return;
    }
    const ref = parseObjectId(id)!;
    const p = this.positionOf(id);
    if (!p || ref.kind === 'relationship') {
      this.focusRing.visible = false;
      return;
    }
    this.focusRing.visible = true;
    this.focusRing.position.copy(p);
    let r = MOON_R * 2.2;
    if (ref.kind === 'table') {
      const n = this.bodies.get(id)!;
      r = n.body.radius * n.scale * 1.75;
    }
    this.focusRing.scale.setScalar(r * 2 * (1 + pulse * 0.06));
  }

  /* ------------------------------------------------------------ labels */

  private syncMoonLabels() {
    const table = this.focusTable();
    const want = new Set(this.orrery?.moons.filter((m) => m.table === table).map((m) => m.id) ?? []);
    for (const [id, el] of this.moonLabels) {
      if (!want.has(id)) {
        el.remove();
        this.moonLabels.delete(id);
      }
    }
    for (const id of want) {
      if (this.moonLabels.has(id)) continue;
      const m = this.orrery!.moons.find((x) => x.id === id)!;
      const el = this.makeLabel(m.name, 'moon', id);
      el.setAttribute('aria-label', `Measure ${m.name}${m.hidden ? ', hidden' : ''}. Fly to it.`);
      this.moonLabels.set(id, el);
    }
    for (const [id, el] of this.moonLabels) el.toggleAttribute('data-focus', id === this.focus);
  }

  private updateLabels() {
    const o = this.orrery;
    if (!o) return;
    const { w, h } = this.size;
    const v = new THREE.Vector3();
    const camPos = this.camera.position;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    type Cand = { el: HTMLButtonElement; x: number; y: number; pri: number; size: { w: number; h: number }; dim: boolean };
    const cands: Cand[] = [];
    const measure = (el: HTMLButtonElement, cache: { size: { w: number; h: number } | null }) => {
      if (!cache.size) cache.size = { w: el.offsetWidth || 60, h: el.offsetHeight || 18 };
      return cache.size;
    };
    for (const n of this.bodies.values()) {
      v.copy(n.pos).project(this.camera);
      const behind = v.z > 1;
      const dist = camPos.distanceTo(n.pos);
      const rpx = ((n.body.radius * n.scale) / (dist * tanHalf)) * (h / 2);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h + rpx + 4;
      if (behind || x < -80 || x > w + 80 || y < -40 || y > h + 40) {
        n.label.style.visibility = 'hidden';
        continue;
      }
      const cache = { size: n.labelSize };
      const size = measure(n.label, cache);
      n.labelSize = cache.size;
      const isFocus = this.focus === n.body.id;
      const isHover = this.hovered === n.body.id;
      const near = this.related?.has(n.body.name) ?? false;
      const pri = isFocus ? 1e6 : isHover ? 9e5 : n.body.kind === 'sun' ? 5e5 + rpx : near ? 4e5 + rpx : rpx * 100 - dist;
      cands.push({ el: n.label, x, y, pri, size, dim: !!this.related && !near });
      n.label.toggleAttribute('data-hot', isHover);
    }
    for (const [id, el] of this.moonLabels) {
      const m = o.moons.find((x) => x.id === id);
      const raw = el.dataset.x?.split(',').map(Number);
      if (!m || !raw) continue;
      v.set(raw[0], raw[1], raw[2]).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h + 8;
      if (v.z > 1) {
        el.style.visibility = 'hidden';
        continue;
      }
      const size = { w: el.offsetWidth || 50, h: el.offsetHeight || 16 };
      cands.push({ el, x, y, pri: this.focus === id ? 1.1e6 : 3e5, size, dim: false });
    }
    cands.sort((a, b) => b.pri - a.pri);
    const placed: { l: number; t: number; r: number; b: number }[] = [];
    for (const c of cands) {
      // Keep labels inside the canvas (left of the side panel) rather than cut at the edge.
      const maxL = w - (w > 600 ? this.sideOffset : 0) - c.size.w - 4;
      const l0 = Math.max(4, Math.min(c.x - c.size.w / 2, maxL));
      const rect = { l: l0, t: c.y, r: l0 + c.size.w, b: c.y + c.size.h };
      const clash = placed.some((p) => rect.l < p.r && rect.r > p.l && rect.t < p.b && rect.b > p.t);
      // Labels never sit under a floating panel (or under the side panel).
      const covered =
        (w > 600 && rect.r > w - this.sideOffset) || this.overlays.some((p) => rect.l < p.r && rect.r > p.l && rect.t < p.b && rect.b > p.t);
      if (covered || (clash && c.pri < 9e5)) {
        c.el.style.visibility = 'hidden';
        continue;
      }
      placed.push(rect);
      c.el.style.visibility = 'visible';
      c.el.style.transform = `translate3d(${Math.round(rect.l)}px, ${Math.round(rect.t)}px, 0)`;
      c.el.toggleAttribute('data-dim', c.dim);
    }
  }

  /* ------------------------------------------------------------ pointer */

  private setHover(id: string | null) {
    if (id === this.hovered) return;
    this.hovered = id;
    this.renderer.domElement.style.cursor = id ? 'pointer' : '';
    this.cb.onHover?.(id);
  }

  private pick(clientX: number, clientY: number): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = [...this.bodies.values()].map((n) => n.mesh);
    const targets: THREE.Object3D[] = [...meshes];
    if (this.moonSolid) targets.push(this.moonSolid);
    if (this.moonGhost) targets.push(this.moonGhost);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    if (hit.object === this.moonSolid || hit.object === this.moonGhost) {
      const kind = hit.object === this.moonSolid ? 'solid' : 'ghost';
      const e = this.moonIndex.find((x) => x.mesh === kind && x.i === hit.instanceId);
      return e?.moon.id ?? null;
    }
    return (hit.object.userData.id as string) ?? null;
  }

  private onDown = (e: PointerEvent) => {
    this.pointer.down = { x: e.clientX, y: e.clientY };
  };

  private onMove = (e: PointerEvent) => {
    if (this.pointer.down) return;
    this.setHover(this.pick(e.clientX, e.clientY));
  };

  private onUp = (e: PointerEvent) => {
    const d = this.pointer.down;
    this.pointer.down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
    const id = this.pick(e.clientX, e.clientY);
    if (id) this.cb.onPick(id);
  };

  private onLeave = () => {
    this.pointer.down = null;
    this.setHover(null);
  };

  private onLost = (e: Event) => {
    e.preventDefault();
    this.cb.onError?.('The graphics context was lost.');
  };
}

