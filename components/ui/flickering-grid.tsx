"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type FlickeringGridProps = {
  className?: string;
  squareSize?: number;
  gridGap?: number;
  color?: string;
  maxOpacity?: number;
  flickerChance?: number;
  width?: number;
  height?: number;
};

function hexToRgb(value: string) {
  const normalized = value.replace("#", "").trim();
  const expanded = normalized.length === 3
    ? normalized
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
    : normalized;

  if (!/^[\da-fA-F]{6}$/.test(expanded)) {
    return { r: 107, g: 114, b: 128 };
  }

  const channel = Number.parseInt(expanded, 16);

  return {
    r: (channel >> 16) & 255,
    g: (channel >> 8) & 255,
    b: channel & 255,
  };
}

export function FlickeringGrid({
  className,
  squareSize = 4,
  gridGap = 6,
  color = "#6B7280",
  maxOpacity = 0.5,
  flickerChance = 0.08,
  width,
  height,
}: FlickeringGridProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const { r, g, b } = hexToRgb(color);
    const dpr = window.devicePixelRatio || 1;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let columns = 0;
    let rows = 0;
    let cellCount = 0;
    let opacities: number[] = [];
    let targets: number[] = [];

    const step = squareSize + gridGap;

    const resetGrid = () => {
      const bounds = canvas.getBoundingClientRect();
      const logicalWidth = Math.max(Math.floor(bounds.width || width || 0), 1);
      const logicalHeight = Math.max(Math.floor(bounds.height || height || 0), 1);

      canvas.width = Math.floor(logicalWidth * dpr);
      canvas.height = Math.floor(logicalHeight * dpr);
      canvas.style.width = `${logicalWidth}px`;
      canvas.style.height = `${logicalHeight}px`;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      columns = Math.ceil(logicalWidth / step);
      rows = Math.ceil(logicalHeight / step);
      cellCount = columns * rows;
      opacities = Array.from({ length: cellCount }, () => Math.random() * maxOpacity * 0.6);
      targets = Array.from({ length: cellCount }, () => Math.random() * maxOpacity);
    };

    const draw = () => {
      const logicalWidth = canvas.width / dpr;
      const logicalHeight = canvas.height / dpr;

      context.clearRect(0, 0, logicalWidth, logicalHeight);

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const index = row * columns + column;

          if (Math.random() < flickerChance) {
            targets[index] = Math.random() * maxOpacity;
          }

          const current = opacities[index] ?? 0;
          const target = prefersReducedMotion ? maxOpacity * 0.18 : (targets[index] ?? 0);
          const nextOpacity = current + (target - current) * (prefersReducedMotion ? 0.06 : 0.12);
          opacities[index] = nextOpacity;

          if (nextOpacity < 0.015) {
            continue;
          }

          context.fillStyle = `rgba(${r}, ${g}, ${b}, ${nextOpacity})`;
          context.fillRect(column * step, row * step, squareSize, squareSize);
        }
      }

      frameId = window.requestAnimationFrame(draw);
    };

    resetGrid();
    draw();

    resizeObserver = new ResizeObserver(() => {
      resetGrid();
    });

    resizeObserver.observe(canvas);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
    };
  }, [color, flickerChance, gridGap, height, maxOpacity, squareSize, width]);

  return <canvas ref={canvasRef} className={cn("block h-full w-full", className)} aria-hidden="true" />;
}
