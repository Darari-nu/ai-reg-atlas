import { useEffect, useRef, useState } from 'react';
import createGlobe from 'cobe';
import type { GlobeMarker } from '../lib/data';
import { centerPhiFor, project, shortestDelta } from '../lib/globeProjection.mjs';
import { fmtDaysAgo } from '../lib/freshness.mjs';

// cobe にヒットテストが無いので、canvas の上に透明な <a> を重ねてクリック/Tab 遷移を作る（監査B案）。
// 位置は globeProjection.project() で毎フレーム計算し、React state ではなく style を直接書く。

const THETA = 0.22;            // createGlobe に渡す傾き。投影計算にも同じ値を使う
const AUTO_SPIN = 0.0028;      // 1フレームあたりの自動回転量（既存値）
const HIT = 24;                // リンクのヒット領域（px 四方）
const EDGE = 0.08;             // これ以下のzは球の縁より向こう。リンクを無効化する
const DRAG_PX = 8;             // これ以上動いたらドラッグ扱い。直後のclickを殺す
const FOCUS_MS = 300;          // フォーカスした国を正面へ回す時間

const GOLD: [number, number, number] = [1, 0.78, 0];
const GREY: [number, number, number] = [0.55, 0.58, 0.65];

// 数合わせ用の見えないマーカー（size 0 なのでシェーダの判定 b<r に一度も入らない）
const DUMMY_MARKER = { location: [0, 0] as [number, number], size: 0, color: GREY };

/** マーカー1つぶんの cobe 用の大きさと色。鮮度が新しいほど大きく金色に寄せる */
function markerStyle(m: GlobeMarker, pulse: number) {
  if (m.kind === 'subregion') return { size: 0.03, color: GREY };
  if (m.ageDays !== null && m.ageDays <= 7) {
    // 脈動ぶんは 0.08〜0.11。reduced-motion では pulse=0 で 0.10 に固定
    return { size: pulse === 0 ? 0.1 : 0.095 + 0.015 * pulse, color: GOLD };
  }
  if (m.ageDays !== null && m.ageDays <= 30) return { size: 0.07, color: GOLD };
  return { size: 0.05, color: GREY };
}

/** リンクの読み上げ名。国名＋最終更新からの日数 */
function linkLabel(m: GlobeMarker): string {
  return m.ageDays === null ? m.name_ja : `${m.name_ja}（更新: ${fmtDaysAgo(m.ageDays)}）`;
}

export default function Globe({ markers, media }: { markers: GlobeMarker[]; media?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  // PC用/スマホ用の2インスタンスが同居するため、表示されない側はWebGLもオーバーレイも起こさない
  const [active] = useState(
    () => typeof window === 'undefined' || !media || window.matchMedia(media).matches
  );

  // リンクにするのは国だけ（小地域まで出すと点が混み、Tab順も肥大する）
  const links = markers.filter((m) => m.kind === 'country');

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const nav = navRef.current;
    if (!canvas || !wrap || !active) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let phi = 0;            // 自動回転ぶん
    let manualPhi = 0;      // ドラッグ・キーボードで足したぶん
    let pointerDown = false;
    let lastX = 0;
    let downX = 0;
    let downY = 0;
    let dragged = false;
    let suppressClick = false;
    let focusHeld = false;  // nav 内にフォーカスがある間は自動回転を止める
    let anim: { from: number; delta: number; start: number } | null = null;

    const onResize = () => {
      width = canvas.offsetWidth;
    };
    onResize();
    // 幅はレイアウト（スマホの135%ヒーロー等）で変わるので ResizeObserver で追う
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);

    /** cobe に渡すマーカー配列。pulse は −1..1 */
    const buildMarkers = (pulse: number, pad = false) => {
      const out = markers.map((m) => {
        const s = markerStyle(m, pulse);
        return { location: [m.lat, m.lng] as [number, number], size: s.size, color: s.color };
      });
      // cobe 0.6.5 の不具合よけ: onRender で markers を差し替えると、マーカー数のuniform C に
      // 「要素数×2」ではなく要素数がそのまま入るため、後半のマーカーが描かれなくなる
      // （初期化時は ×2 されていて正しい）。同数のダミー（size 0＝描画されない）を足して
      // 長さを2倍にし、C の辻褄を合わせる。
      if (pad) for (let i = 0; i < markers.length; i++) out.push(DUMMY_MARKER);
      return out;
    };

    // 脈動させる点（7日以内の更新）が無いフレームでは markers を差し替えない。
    // シェーダのマーカー上限は64個なので、ダミーで倍にすると超える場合も差し替えない
    const pulses =
      !reduced &&
      markers.length * 2 <= 64 &&
      markers.some((m) => m.kind === 'country' && m.ageDays !== null && m.ageDays <= 7);

    /** 全リンクを現在の回転に合わせて置き直す */
    const placeLinks = (totalPhi: number) => {
      for (let i = 0; i < links.length; i++) {
        const el = linkRefs.current[i];
        if (!el) continue;
        const m = links[i];
        const { x, y, z } = project({ lat: m.lat, lng: m.lng }, { phi: totalPhi, theta: THETA, width });
        el.style.transform = `translate(${x - HIT / 2}px, ${y - HIT / 2}px)`;
        const hidden = z <= EDGE;
        // visibility/display はTab順から外れてしまうので、透明＋クリック無効で裏側を表す
        el.style.opacity = hidden ? '0' : '1';
        el.style.pointerEvents = hidden ? 'none' : 'auto';
      }
    };

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0.6,
      theta: THETA,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 18000,
      mapBrightness: 5.2,
      baseColor: [0.1, 0.13, 0.26],
      markerColor: GOLD,
      glowColor: [0.05, 0.07, 0.17],
      markers: buildMarkers(0),
      onRender: (state: Record<string, unknown>) => {
        if (anim) {
          const t = Math.min(1, (performance.now() - anim.start) / FOCUS_MS);
          // ease-out。1フレームで終わる reduced-motion 側は anim を作らない
          manualPhi = anim.from + anim.delta * (1 - (1 - t) * (1 - t));
          if (t >= 1) anim = null;
        }
        if (!pointerDown && !focusHeld && !reduced) phi += AUTO_SPIN;
        const total = phi + manualPhi;
        state.phi = total;
        state.width = width * 2;
        state.height = width * 2;
        // 「更新国マーカー 金パルス」（既存のモーション枠）。reduced-motion では差し替えない
        if (pulses) state.markers = buildMarkers(Math.sin(performance.now() / 700), true);
        placeLinks(total);
      },
    });

    /* ---- ポインタ操作。リンクの上で始めたドラッグも回すため、ラッパ div で受ける ---- */

    const down = (e: PointerEvent) => {
      pointerDown = true;
      dragged = false;
      suppressClick = false;
      lastX = e.clientX;
      downX = e.clientX;
      downY = e.clientY;
      canvas.style.cursor = 'grabbing';
    };
    // move/up は指がラッパの外へ出ても追えるよう window で受ける
    const move = (e: PointerEvent) => {
      if (!pointerDown) return;
      manualPhi += (e.clientX - lastX) / 140;
      lastX = e.clientX;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > DRAG_PX) dragged = true;
    };
    const up = () => {
      if (!pointerDown) return;
      pointerDown = false;
      // ドラッグ終わりの誤タップ防止。直後の click を1回だけ殺す
      if (dragged) suppressClick = true;
      canvas.style.cursor = 'grab';
    };
    const click = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    };
    wrap.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    wrap.addEventListener('click', click, true);

    /* ---- キーボード。フォーカスした国を正面に回す ---- */

    const focusin = (e: FocusEvent) => {
      const el = (e.target as HTMLElement | null)?.closest('a[data-lng]') as HTMLElement | null;
      if (!el) return;
      focusHeld = true;
      const target = centerPhiFor(Number(el.dataset.lng));
      const delta = shortestDelta(phi + manualPhi, target);
      if (reduced) {
        manualPhi += delta;
        anim = null;
      } else {
        anim = { from: manualPhi, delta, start: performance.now() };
      }
    };
    const focusout = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && nav?.contains(next)) return; // nav 内の移動は回転を止めたまま
      focusHeld = false;
      anim = null;
    };
    nav?.addEventListener('focusin', focusin);
    nav?.addEventListener('focusout', focusout);

    return () => {
      globe.destroy();
      ro.disconnect();
      wrap.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      wrap.removeEventListener('click', click, true);
      nav?.removeEventListener('focusin', focusin);
      nav?.removeEventListener('focusout', focusout);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', touchAction: 'pan-y' }}
    >
      {/* ホバー/フォーカスのラベルだけCSS。角丸・影なし（§デザイン規約） */}
      <style>{OVERLAY_CSS}</style>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ width: '100%', aspectRatio: '1 / 1', cursor: 'grab', contain: 'layout paint size' }}
      />
      {active && (
        <nav
          ref={navRef}
          aria-label="地球儀上の国リンク"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          {links.map((m, i) => (
            <a
              key={m.code}
              ref={(el) => {
                linkRefs.current[i] = el;
              }}
              className="globe-link"
              href={m.href}
              aria-label={linkLabel(m)}
              data-lng={m.lng}
              style={{ transform: `translate(-${HIT * 4}px, -${HIT * 4}px)`, opacity: 0 }}
            >
              <span className="globe-link-label" aria-hidden="true">
                {m.flag} {m.name_ja}
                {m.ageDays !== null ? ` · ${fmtDaysAgo(m.ageDays)}` : ''}
              </span>
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}

const OVERLAY_CSS = `
.globe-link{position:absolute;left:0;top:0;display:block;width:${HIT}px;height:${HIT}px;}
.globe-link:focus{outline:none;}
.globe-link:focus-visible{outline:1px solid #FFC700;outline-offset:0;}
.globe-link-label{position:absolute;left:${HIT - 4}px;top:50%;margin-top:-9px;display:none;
white-space:nowrap;padding:2px 6px;background:#141B36;border:1px solid rgba(250,250,247,0.12);
color:#FAFAF7;font-family:"IBM Plex Mono",monospace;font-size:11px;line-height:1.3;}
.globe-link:hover .globe-link-label,.globe-link:focus-visible .globe-link-label{display:block;}
`;
