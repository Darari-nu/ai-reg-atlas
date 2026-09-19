// 地球儀（cobe 0.6.5）の緯度経度 → 画面座標の純関数。
// DOM も React も import しない。node --test から直接読めるよう .mjs に置く。
//
// 式は cobe のフラグメントシェーダから導出した（node_modules/cobe/dist/index.esm.js）。
//   - マーカーの球面ベクトル P は cobe 内部の x() と同じ定義
//   - シェーダは画面側のベクトル l に回転行列 J(theta, phi) を右から掛けて球面側 m を得る
//     （m = Jᵀ·l）。J は直交なので、その逆は l = J·m。下の lx/ly/lz がその展開
//   - 球の半径は正規化座標で 0.8（シェーダの `c<=.64` = 0.8²）
// 前提: canvas は正方形、offset=[0,0]、scale=1。devicePixelRatio は CSS px に影響しない。

const DEG = Math.PI / 180;

// 球の半径（正規化座標）。シェーダの .64 の平方根
const R = 0.8;

/**
 * @typedef {Object} LatLng
 * @property {number} lat
 * @property {number} lng
 */

/**
 * @typedef {Object} View
 * @property {number} phi    onRender で state.phi に入れるのと同じ値（rad）
 * @property {number} theta  createGlobe の theta（rad）
 * @property {number} width  canvas の CSS 幅 px（正方形なので高さも同じ）
 */

/**
 * 緯度経度 → cobe と同じ球面ベクトル。
 * @param {number} lat
 * @param {number} lng
 * @returns {{x: number, y: number, z: number}}
 */
export function sphereVector(lat, lng) {
  const c0 = lat * DEG;
  const a0 = lng * DEG - Math.PI;
  const t = Math.cos(c0);
  return { x: -t * Math.cos(a0), y: Math.sin(c0), z: t * Math.sin(a0) };
}

/**
 * 緯度経度を画面座標（CSS px、左上原点）へ投影する。
 * z は視線方向の成分で、z > 0 なら手前の面。z が小さいほど球の縁に近い。
 * @param {LatLng} point
 * @param {View} view
 * @returns {{x: number, y: number, z: number}}
 */
export function project({ lat, lng }, { phi, theta, width }) {
  const P = sphereVector(lat, lng);

  const d = Math.cos(phi);
  const f = Math.sin(phi);
  const c = Math.cos(theta);
  const e = Math.sin(theta);

  const lx = d * P.x + f * P.z;
  const ly = f * e * P.x + c * P.y - d * e * P.z;
  const lz = -f * c * P.x + e * P.y + d * c * P.z;

  return {
    x: ((1 + R * lx) / 2) * width,
    y: ((1 - R * ly) / 2) * width,
    z: lz,
  };
}

/**
 * その経度を正面（画面中央）に持ってくる phi。
 * 正面の経度は 270° − phi[deg] なので phi = (270 − lng)·π/180。0..2π に正規化して返す。
 * @param {number} lng
 * @returns {number}
 */
export function centerPhiFor(lng) {
  return normalizeAngle((270 - lng) * DEG);
}

/**
 * 角度を 0..2π に正規化する。
 * @param {number} rad
 * @returns {number}
 */
export function normalizeAngle(rad) {
  const tau = Math.PI * 2;
  return ((rad % tau) + tau) % tau;
}

/**
 * from から to への最短回転量（−π..π）。自動回転の phi に足し込むために使う。
 * @param {number} from
 * @param {number} to
 * @returns {number}
 */
export function shortestDelta(from, to) {
  const tau = Math.PI * 2;
  const diff = normalizeAngle(to - from);
  return diff > Math.PI ? diff - tau : diff;
}
