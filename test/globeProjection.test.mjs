import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  centerPhiFor,
  normalizeAngle,
  project,
  shortestDelta,
  sphereVector,
} from '../src/lib/globeProjection.mjs';

const W = 500;
const EPS = 1e-6;

/** 許容誤差つきの数値比較 */
const near = (actual, expected, label) =>
  assert.ok(
    Math.abs(actual - expected) <= EPS,
    `${label ?? ''} 期待 ${expected} / 実際 ${actual}`
  );

/** phi, theta を省略できる project */
const p = (lat, lng, phi = 0, theta = 0) => project({ lat, lng }, { phi, theta, width: W });

describe('project（phi=0, theta=0）', () => {
  it('lng=-90 は正面。中央に来て z=1', () => {
    const r = p(0, -90);
    near(r.x, 250, 'x');
    near(r.y, 250, 'y');
    near(r.z, 1, 'z');
  });

  it('北極は中央上。半径 0.8 ぶん上にずれ、z はほぼ 0', () => {
    const r = p(90, 0);
    near(r.x, 250, 'x');
    near(r.y, 50, 'y');
    near(r.z, 0, 'z');
  });

  it('lng=0 は右端の縁。x=450 で z はほぼ 0', () => {
    const r = p(0, 0);
    near(r.x, 450, 'x');
    near(r.y, 250, 'y');
    near(r.z, 0, 'z');
  });

  it('lng=180 は左端の縁。x=50', () => {
    const r = p(0, 180);
    near(r.x, 50, 'x');
    near(r.y, 250, 'y');
    near(r.z, 0, 'z');
  });

  it('lng=90 は裏側。z=-1', () => {
    near(p(0, 90).z, -1, 'z');
  });
});

describe('project（回転・傾き）', () => {
  it('phi=π/2 まで回すと lng=180 が正面に来る', () => {
    const r = p(0, 180, Math.PI / 2);
    near(r.x, 250, 'x');
    near(r.y, 250, 'y');
    near(r.z, 1, 'z');
  });

  it('theta=0.22 は見下ろしなので正面の点が下へずれ、z=cos(theta) になる', () => {
    const r = p(0, -90, 0, 0.22);
    assert.ok(r.y > 250, `y が 250 より下にあること: ${r.y}`);
    near(r.x, 250, 'x');
    near(r.z, Math.cos(0.22), 'z');
    // 下へのずれ量は 0.8·sin(theta) を画面半径に直したぶん
    near(r.y, ((1 + 0.8 * Math.sin(0.22)) / 2) * W, 'y');
  });
});

describe('centerPhiFor', () => {
  for (const lng of [-90, 0, 139]) {
    it(`lng=${lng} を正面に持ってくる phi が求まる`, () => {
      const r = p(0, lng, centerPhiFor(lng));
      near(r.x, 250, 'x');
      near(r.y, 250, 'y');
      near(r.z, 1, 'z');
    });
  }

  it('戻り値は 0..2π に正規化されている', () => {
    for (const lng of [-180, -90, 0, 90, 139, 180, 360]) {
      const phi = centerPhiFor(lng);
      assert.ok(phi >= 0 && phi < Math.PI * 2, `lng=${lng} → ${phi}`);
    }
  });
});

describe('sphereVector', () => {
  it('cobe と同じ単位ベクトルを返す', () => {
    for (const [lat, lng] of [[0, -90], [35.68, 139.77], [-35.28, 149.13], [90, 0]]) {
      const v = sphereVector(lat, lng);
      near(Math.hypot(v.x, v.y, v.z), 1, `|P| lat=${lat} lng=${lng}`);
    }
  });
});

describe('normalizeAngle / shortestDelta', () => {
  it('負の角も 0..2π に畳む', () => {
    near(normalizeAngle(-Math.PI / 2), (3 * Math.PI) / 2);
    near(normalizeAngle(Math.PI * 4 + 1), 1);
  });

  it('最短方向の差分を返す（-π..π）', () => {
    near(shortestDelta(0.1, 0.4), 0.3);
    // 0.1 から 2π-0.1 へは、正方向に 2π-0.2 進むより負方向に 0.2 戻るほうが近い
    near(shortestDelta(0.1, Math.PI * 2 - 0.1), -0.2);
    assert.ok(Math.abs(shortestDelta(0, Math.PI * 1.5)) <= Math.PI);
  });
});
