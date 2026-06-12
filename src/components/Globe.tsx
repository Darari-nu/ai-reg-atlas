import { useEffect, useRef } from 'react';
import createGlobe from 'cobe';

type MarkerInput = { lat: number; lng: number; recent: boolean };

export default function Globe({ markers }: { markers: MarkerInput[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let phi = 0;
    let manualPhi = 0;
    let pointerDown = false;
    let lastX = 0;

    const onResize = () => {
      width = canvas.offsetWidth;
    };
    window.addEventListener('resize', onResize);
    onResize();

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0.6,
      theta: 0.22,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 18000,
      mapBrightness: 5.2,
      baseColor: [0.1, 0.13, 0.26],
      markerColor: [1, 0.78, 0],
      glowColor: [0.05, 0.07, 0.17],
      markers: markers.map((m) => ({
        location: [m.lat, m.lng],
        size: m.recent ? 0.1 : 0.05,
      })),
      onRender: (state) => {
        if (!pointerDown && !reduced) phi += 0.0028;
        state.phi = phi + manualPhi;
        state.width = width * 2;
        state.height = width * 2;
      },
    });

    const down = (e: PointerEvent) => {
      pointerDown = true;
      lastX = e.clientX;
      canvas.style.cursor = 'grabbing';
    };
    const move = (e: PointerEvent) => {
      if (pointerDown) {
        manualPhi += (e.clientX - lastX) / 140;
        lastX = e.clientX;
      }
    };
    const up = () => {
      pointerDown = false;
      canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);

    return () => {
      globe.destroy();
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width: '100%', aspectRatio: '1 / 1', cursor: 'grab', contain: 'layout paint size' }}
    />
  );
}
