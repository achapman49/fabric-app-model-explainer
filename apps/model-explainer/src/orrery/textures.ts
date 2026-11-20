/** Procedural textures for the orrery, drawn on canvases at runtime (no image files, no network). */
import * as THREE from 'three';

import { hash01 } from '../domain/orrery';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, srgb = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Soft radial glow, white to transparent (tinted by the sprite colour). */
export function glowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

/** A ring with a soft outer glow: flares and the focus marker. */
export function ringTexture(width = 0.06, glow = true): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = 128 * 0.78;
  if (glow) {
    const grad = g.createRadialGradient(128, 128, r * 0.7, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 256 * width;
  g.beginPath();
  g.arc(128, 128, r, 0, Math.PI * 2);
  g.stroke();
  return tex(c);
}

/** Dashed circle: the outline of a hidden (ghost) body. */
export function dashedRingTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 7;
  g.setLineDash([16, 12]);
  g.beginPath();
  g.arc(128, 128, 112, 0, Math.PI * 2);
  g.stroke();
  return tex(c);
}

/** Round dot for stars and flow particles. */
export function dotTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return tex(c);
}

/** Banded gas-giant surface in greys (the material colour tints it), seeded by the table name. */
export function planetTexture(seed: string): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const [c, g] = canvas(W, H);
  const rnd = (k: number) => hash01(`${seed}#${k}`);
  const bands = 3 + Math.floor(rnd(1) * 5);
  const f1 = 2 + rnd(2) * 6;
  const f2 = 9 + rnd(3) * 14;
  const p1 = rnd(4) * 6.28;
  const contrast = 0.1 + rnd(5) * 0.1;
  const img = g.createImageData(W, H);
  const s0 = rnd(7) * 1000;
  const grain = (x: number, y: number) => {
    const n = Math.sin(x * 12.9898 + y * 78.233 + s0) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const band = Math.sin(v * Math.PI * bands * 2 + p1) * contrast + Math.sin(v * f2 + p1 * 2) * contrast * 0.5;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const swirl = Math.sin(u * Math.PI * 2 * f1 + v * 9 + p1) * 0.025 + (grain(x >> 2, y >> 1) - 0.5) * 0.035;
      const l = Math.max(0, Math.min(1, 0.86 + band + swirl));
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(l * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // A storm or two.
  const storms = Math.floor(rnd(6) * 3);
  for (let k = 0; k < storms; k++) {
    const x = rnd(10 + k) * W;
    const y = H * (0.3 + rnd(20 + k) * 0.4);
    const grad = g.createRadialGradient(x, y, 0, x, y, 10 + rnd(30 + k) * 10);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, 22, 8, 0, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c, true);
}

/** Saturn-like ring bands (alpha stripes), mapped across a RingGeometry's radius. */
export function ringBandsTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 8);
  for (let x = 0; x < 256; x++) {
    const a = 0.25 + 0.55 * Math.abs(Math.sin(x * 0.11) * Math.sin(x * 0.037 + 1)) * (x > 20 && x < 236 ? 1 : x / 40);
    g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    g.fillRect(x, 0, 1, 8);
  }
  return tex(c);
}
