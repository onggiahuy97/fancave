import * as THREE from 'three';
import { CLUB_NAME } from '@fancave/shared';

export const RED = '#c8102e';
export const DARK_RED = '#7a0a1c';
export const BLACK = '#111111';
export const GOLD = '#f2b33d';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Original club emblem: a flame inside a ring. */
function drawEmblem(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Flame
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.72);
  ctx.bezierCurveTo(r * 0.55, -r * 0.2, r * 0.55, r * 0.45, 0, r * 0.62);
  ctx.bezierCurveTo(-r * 0.55, r * 0.45, -r * 0.5, -r * 0.05, -r * 0.12, -r * 0.3);
  ctx.bezierCurveTo(-r * 0.1, -r * 0.05, r * 0.05, 0, 0, -r * 0.72);
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.18);
  ctx.bezierCurveTo(r * 0.28, r * 0.08, r * 0.28, r * 0.4, 0, r * 0.48);
  ctx.bezierCurveTo(-r * 0.28, r * 0.4, -r * 0.24, r * 0.1, 0, -r * 0.18);
  ctx.fill();
  ctx.restore();
}

/** Hanging banner with swallowtail cut (alpha) and club name. */
export function makeBannerTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 640);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(256, 0);
  ctx.lineTo(256, 640);
  ctx.lineTo(128, 540);
  ctx.lineTo(0, 640);
  ctx.closePath();
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, 640);
  g.addColorStop(0, '#9e0c24');
  g.addColorStop(0.5, RED);
  g.addColorStop(1, '#8a0b20');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 640);
  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, 256, 56);
  ctx.fillRect(0, 70, 256, 12);
  ctx.fillRect(18, 0, 14, 640);
  ctx.fillRect(224, 0, 14, 640);
  drawEmblem(ctx, 128, 230, 78);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(128, 400);
  const name = CLUB_NAME.toUpperCase();
  const fit = Math.min(1, 180 / ctx.measureText(name).width);
  ctx.scale(fit, 1);
  ctx.fillText(name, 0, 0);
  ctx.restore();
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = GOLD;
  ctx.fillText('★ CAVE ★', 128, 440);
  ctx.restore();
  return toTexture(c);
}

export const POSTER_CELLS = 6;

/** 6 generic "player poster" cells laid out horizontally in one atlas. */
export function makePosterAtlas(): THREE.CanvasTexture {
  const cw = 256;
  const ch = 352;
  const [c, ctx] = canvas(cw * POSTER_CELLS, ch);
  const numbers = [7, 9, 10, 4, 1, 11];
  const captions = [
    'THE CAPTAIN',
    'GOAL MACHINE',
    'THE MAESTRO',
    'THE WALL',
    'SAFE HANDS',
    'SPEEDSTER',
  ];
  const skin = ['#f1c7a1', '#c98f62', '#8d5a3b', '#e8b48c', '#b07650', '#f6d5b8'];
  for (let i = 0; i < POSTER_CELLS; i++) {
    const x0 = i * cw;
    ctx.save();
    ctx.translate(x0, 0);
    const g = ctx.createLinearGradient(0, 0, cw, ch);
    g.addColorStop(0, i % 2 ? '#2a0509' : RED);
    g.addColorStop(1, BLACK);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
    // Diagonal stripes.
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ffffff';
    for (let s = -ch; s < cw; s += 36) {
      ctx.beginPath();
      ctx.moveTo(s, ch);
      ctx.lineTo(s + 16, ch);
      ctx.lineTo(s + 16 + ch, 0);
      ctx.lineTo(s + ch, 0);
      ctx.fill();
    }
    ctx.globalAlpha = 0.22;
    ctx.font = 'bold 210px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(numbers[i]), cw / 2, 220);
    ctx.globalAlpha = 1;
    // Chibi silhouette.
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.roundRect(cw / 2 - 52, 170, 104, 110, 26);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cw / 2 - 52, 262, 104, 26);
    ctx.fillStyle = skin[i] ?? '#f1c7a1';
    ctx.beginPath();
    ctx.arc(cw / 2, 128, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1210';
    ctx.beginPath();
    ctx.arc(cw / 2, 116, 64, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cw / 2 - 22, 134, 7, 0, Math.PI * 2);
    ctx.arc(cw / 2 + 22, 134, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(String(numbers[i]), cw / 2, 232);
    // Caption bar.
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, ch - 56, cw, 56);
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText(captions[i] ?? '', cw / 2, ch - 20);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, cw - 6, ch - 6);
    ctx.restore();
  }
  return toTexture(c);
}

/** Placeholder for the future scoreboard / watch-party wall screen. */
export function makeScreenTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#16090b');
  g.addColorStop(1, '#050304');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.strokeStyle = RED;
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, 996, 484);
  drawEmblem(ctx, 512, 190, 92);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText('MATCH DAY', 512, 370);
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('LIVE SCOREBOARD · COMING SOON', 512, 430);
  return toTexture(c);
}
