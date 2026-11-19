// 世界の陸地（Natural Earth 1:110m・公有。world-atlas の land-110m.json）を正距円筒の SVG パスにする。
// ビルド時だけ使う（ページには出来上がった d 属性の文字列だけが載る）。
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { equirect } from './digests.mjs';

const require = createRequire(import.meta.url);
let cache = null;

function landRings() {
  if (cache) return cache;
  const topo = JSON.parse(fs.readFileSync(require.resolve('world-atlas/land-110m.json'), 'utf8'));
  const geo = feature(topo, topo.objects.land);
  const rings = [];
  for (const f of geo.features ?? [geo]) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) for (const ring of poly) rings.push(ring);
  }
  cache = rings;
  return rings;
}

/**
 * 経度 ±180 をまたぐリングを、つながった形に直す（経度を ±360 して連続させる）。
 * 極を一周するリング（南極）は、極の緯度まで下ろして閉じる。戻り値は [lng, lat] の配列（lng は -540〜540 になりうる）。
 */
export function unwrapRing(ring) {
  const out = [];
  let shift = 0;
  let prev = null;
  for (const [lng, lat] of ring) {
    if (prev !== null) {
      const d = lng + shift - prev;
      if (d > 180) shift -= 360;
      else if (d < -180) shift += 360;
    }
    const x = lng + shift;
    out.push([x, lat]);
    prev = x;
  }
  const net = out[out.length - 1][0] - out[0][0];
  if (Math.abs(net) > 180) {
    const meanLat = out.reduce((a, p) => a + p[1], 0) / out.length;
    const pole = meanLat < 0 ? -90 : 90;
    out.push([out[out.length - 1][0], pole], [out[0][0], pole]);
  }
  return out;
}

/**
 * 陸地の SVG パス（width × width/2 の座標系）。±180 をまたぐ陸地は、はみ出した側を 360 度ずらした写しも描く
 * （はみ出しは SVG の枠で切れるので、左右の両端に正しく閉じた形が出る）。
 */
export function landPath(width) {
  const parts = [];
  const draw = (pts, offset) =>
    pts
      .map(([lng, lat], i) => {
        const { x, y } = equirect(lat, lng + offset, width);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join('') + 'Z';
  for (const ring of landRings()) {
    const pts = unwrapRing(ring);
    const lngs = pts.map((p) => p[0]);
    const lo = Math.min(...lngs);
    const hi = Math.max(...lngs);
    for (const offset of [-360, 0, 360]) {
      if (hi + offset <= -180 || lo + offset >= 180) continue; // 枠に1点も入らない写しは描かない
      parts.push(draw(pts, offset));
    }
  }
  return parts.join('');
}
