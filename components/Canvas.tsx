"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, type RefObject } from "react";
import { getStroke } from "perfect-freehand";

/** Everything is drawn in a fixed 1000x1000 space, whatever the element size. */
const SPACE = 1000;
const INK = "#171412";

type Stroke = { points: number[][]; path?: Path2D };

export type CanvasHandle = {
  clear: () => void;
  undo: () => void;
  ink: () => number;
  /** A white PNG of the ink, cropped to the drawing. Null on an empty page. */
  snapshot: (size: number) => string | null;
};

function outline(points: number[][]): Path2D {
  const path = new Path2D();
  if (points.length === 0) return path;
  if (points.length < 3) {
    const [x, y] = points[0];
    path.arc(x, y, 4.5, 0, Math.PI * 2);
    return path;
  }
  const stroke = getStroke(points, {
    size: 9,
    thinning: 0.55,
    smoothing: 0.55,
    streamline: 0.45,
    simulatePressure: true,
  });
  if (stroke.length < 2) return path;
  path.moveTo(stroke[0][0], stroke[0][1]);
  for (let i = 1; i < stroke.length; i++) {
    const [x0, y0] = stroke[i - 1];
    const [x1, y1] = stroke[i];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.closePath();
  return path;
}

function lengthOf(points: number[][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

export function Canvas({
  handleRef,
  disabled,
  onChange,
}: {
  handleRef: RefObject<CanvasHandle | null>;
  disabled?: boolean;
  onChange?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const active = useRef<Stroke | null>(null);
  const drawing = useRef(false);
  const frame = useRef(0);
  const size = useRef({ w: 0, h: 0 });

  const paint = useCallback((ctx: CanvasRenderingContext2D, k: number, inkDone: boolean) => {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = INK;
    for (const s of strokes.current) {
      if (!s.path) s.path = outline(s.points);
      ctx.fill(s.path);
    }
    if (active.current) {
      const s = active.current;
      if (!s.path) s.path = outline(s.points);
      ctx.fill(s.path);
    }
    if (inkDone) ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const k = canvas.width / SPACE;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paint(ctx, k, true);
  }, [paint]);

  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      size.current = { w: rect.width, h: rect.height };
      draw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  const toSpace = useCallback((event: React.PointerEvent<HTMLCanvasElement>): number[] => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * SPACE;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * SPACE;
    return [Math.round(x), Math.round(y)];
  }, []);

  useImperativeHandle(
    handleRef,
    (): CanvasHandle => ({
      clear() {
        strokes.current = [];
        active.current = null;
        draw();
        onChange?.();
      },
      undo() {
        strokes.current.pop();
        draw();
        onChange?.();
      },
      ink() {
        let total = strokes.current.reduce((sum, s) => sum + lengthOf(s.points) + 4, 0);
        if (active.current) total += lengthOf(active.current.points);
        return total;
      },
      snapshot(target: number) {
        if (strokes.current.length === 0) return null;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const s of strokes.current) {
          for (const [x, y] of s.points) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
        if (!Number.isFinite(minX)) return null;
        const w = Math.max(1, maxX - minX);
        const h = Math.max(1, maxY - minY);
        // Small doodles are not blown up to the full frame: the models should
        // see the same proportions a person does.
        const side = Math.max(w, h, 300) * 1.18;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        const off = document.createElement("canvas");
        off.width = target;
        off.height = target;
        const ctx = off.getContext("2d");
        if (!ctx) return null;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, target, target);
        const k = target / side;
        ctx.setTransform(k, 0, 0, k, target / 2 - cx * k, target / 2 - cy * k);
        ctx.fillStyle = INK;
        for (const s of strokes.current) {
          if (!s.path) s.path = outline(s.points);
          ctx.fill(s.path);
        }
        return off.toDataURL("image/png");
      },
    }),
    [draw, onChange],
  );

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full touch-none select-none rounded-xl bg-white"
      style={{ cursor: disabled ? "default" : "crosshair" }}
      role="img"
      aria-label="Drawing canvas"
      onPointerDown={(event) => {
        if (disabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = true;
        active.current = { points: [toSpace(event)] };
        schedule();
      }}
      onPointerMove={(event) => {
        if (!drawing.current || disabled) return;
        const point = toSpace(event);
        const last = active.current?.points[active.current.points.length - 1];
        if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < 1.5) return;
        active.current?.points.push(point);
        active.current!.path = undefined;
        schedule();
      }}
      onPointerUp={() => {
        if (!drawing.current) return;
        drawing.current = false;
        const done = active.current;
        active.current = null;
        if (done && done.points.length > 0) strokes.current.push(done);
        schedule();
        onChange?.();
      }}
      onPointerCancel={() => {
        drawing.current = false;
        active.current = null;
        schedule();
      }}
    />
  );
}
