import type { SVGProps } from "react";

type PlatformLogoProps = {
  name: string;
  color: string;
  className?: string;
};

const platformIconPaths: Record<string, string[]> = {
  google: ["M20.945 11a9 9 0 1 1 -3.284 -5.997l-2.655 2.392a5.5 5.5 0 1 0 2.119 6.605h-4.125v-3h7.945"],
  tiktok: ["M21 7.917v4.034a9.948 9.948 0 0 1 -5 -1.951v4.5a6.5 6.5 0 1 1 -8 -6.326v4.326a2.5 2.5 0 1 0 4 2v-11.5h4.083a6.005 6.005 0 0 0 4.917 4.917"],
  ebay: [
    "M4 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0",
    "M11 17h-5v-14h-2",
    "M6 5l14 1l-.718 5.023m-6.282 1.977h-7",
    "M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
    "M20.2 20.2l1.8 1.8",
  ],
  alibaba: [
    "M3 21l18 0",
    "M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2 -4h14l2 4",
    "M5 21l0 -10.15",
    "M19 21l0 -10.15",
    "M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4",
  ],
  amazon: [
    "M17 12.5a15.198 15.198 0 0 1 -7.37 1.44a14.62 14.62 0 0 1 -6.63 -2.94",
    "M19.5 15c.907 -1.411 1.451 -3.323 1.5 -5c-1.197 -.773 -2.577 -.935 -4 -1",
  ],
  walmart: [
    "M3 21l18 0",
    "M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2 -4h14l2 4",
    "M5 21l0 -10.15",
    "M19 21l0 -10.15",
    "M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4",
  ],
  keepa: ["M4 19l16 0", "M4 15l4 -6l4 2l4 -5l4 4"],
  sprite: [
    "M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -6",
    "M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -10",
    "M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -14",
    "M4 20h14",
  ],
  search: ["M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "M21 21l-6 -6"],
  store: [
    "M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1l0 -10",
    "M7 20h10",
    "M9 16v4",
    "M15 16v4",
    "M9 12v-4",
    "M12 12v-1",
    "M15 12v-2",
    "M12 12v-1",
  ],
  patent: [
    "M14 3v4a1 1 0 0 0 1 1h4",
    "M12 21h-5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v4.5",
    "M14 17.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0",
    "M18.5 19.5l2.5 2.5",
  ],
  jimu: [
    "M12 21a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3c.539 1.832 .627 3.747 .283 5.588",
    "M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
    "M20.2 20.2l1.8 1.8",
  ],
  grid: [
    "M4 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
    "M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
    "M18 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
    "M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
    "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
    "M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
    "M4 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
    "M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
    "M18 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  ],
};

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getPlatformIconPaths(name: string) {
  return platformIconPaths[name] ?? platformIconPaths.grid;
}

export function getPlatformLogoSvgMarkup({ name, color, className = "" }: PlatformLogoProps) {
  const paths = getPlatformIconPaths(name);
  const pathMarkup = paths.map((path) => `<path d="${escapeHtmlAttribute(path)}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="${escapeHtmlAttribute(className)}" style="color:${escapeHtmlAttribute(color)}"><path stroke="none" d="M0 0h24v24H0z" fill="none"/>${pathMarkup}</svg>`;
}

export function PlatformLogo({ name, color, className, ...props }: PlatformLogoProps & Omit<SVGProps<SVGSVGElement>, keyof PlatformLogoProps>) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      color={color}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.9}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      {getPlatformIconPaths(name).map((path, index) => (
        <path key={`${name}-${index}`} d={path} />
      ))}
    </svg>
  );
}
