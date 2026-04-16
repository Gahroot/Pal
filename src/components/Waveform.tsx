import { useEffect, useRef } from "react";

interface WaveformProps {
  audioLevel: number; // 0-1
  width?: number;
  height?: number;
}

const BAR_COUNT = 12;
const BAR_WIDTH = 3;
const BAR_GAP = 3;
const BAR_RADIUS = 1.5;
const INTERPOLATION_FACTOR = 0.3;
const MIN_BAR_HEIGHT = 2;

export function Waveform({ audioLevel, width, height }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barHeights = useRef<number[]>(new Array(BAR_COUNT).fill(MIN_BAR_HEIGHT));
  const targets = useRef<number[]>(new Array(BAR_COUNT).fill(MIN_BAR_HEIGHT));
  const animFrameRef = useRef<number>(0);

  const canvasWidth = width ?? (BAR_COUNT * BAR_WIDTH + (BAR_COUNT - 1) * BAR_GAP);
  const canvasHeight = height ?? 32;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Update DPR
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);

    function draw() {
      if (!ctx || !canvas) return;

      // Update targets with random variation
      for (let i = 0; i < BAR_COUNT; i++) {
        const variation = 0.4 + Math.random() * 0.6; // 0.4-1.0
        const maxHeight = canvasHeight * 0.85;
        targets.current[i] =
          audioLevel > 0.01
            ? MIN_BAR_HEIGHT + audioLevel * variation * maxHeight
            : MIN_BAR_HEIGHT;
      }

      // Interpolate
      for (let i = 0; i < BAR_COUNT; i++) {
        barHeights.current[i] +=
          (targets.current[i] - barHeights.current[i]) * INTERPOLATION_FACTOR;
      }

      // Clear
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Draw bars
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      for (let i = 0; i < BAR_COUNT; i++) {
        const x = i * (BAR_WIDTH + BAR_GAP);
        const h = Math.max(MIN_BAR_HEIGHT, barHeights.current[i]);
        const y = (canvasHeight - h) / 2;

        // Rounded rect
        ctx.beginPath();
        ctx.roundRect(x, y, BAR_WIDTH, h, BAR_RADIUS);
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [audioLevel, canvasWidth, canvasHeight]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: canvasWidth, height: canvasHeight }}
      className="block"
    />
  );
}
