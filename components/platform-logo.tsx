import {
  siAlibabadotcom,
  siEbay,
  siGoogle,
  siTiktok,
} from "simple-icons";

type PlatformLogoProps = {
  name: string;
  color: string;
  className?: string;
};

const iconMap: Record<string, { path: string; viewBox?: string }> = {
  google: { path: siGoogle.path },
  tiktok: { path: siTiktok.path },
  ebay: { path: siEbay.path },
  alibaba: { path: siAlibabadotcom.path },
  amazon: {
    path: "M3.4 12.2c2.4 1.8 5.9 2.8 8.8 2.8 4 0 7.6-1.4 10.3-4 .4-.3 0-.8-.4-.5-3 1.8-6.7 2.8-10.5 2.8-2.6 0-5.4-.5-8-1.8-.4-.2-.7.3-.2.7Zm16.8-1.9c-.3-.4-2.2-.2-3-.1-.2 0-.2-.2 0-.4 1.5-1 4-1.1 4.3-.7.3.4-.1 2.8-1.5 4-.2.2-.4.1-.3-.1.5-1.1.8-2.7.5-3.1Z",
    viewBox: "0 0 24 24",
  },
  walmart: {
    path: "M12 2.5c.7 0 1.3.6 1.3 1.3V7c0 .7-.6 1.3-1.3 1.3S10.7 7.7 10.7 7V3.8c0-.7.6-1.3 1.3-1.3Zm0 13.2c.7 0 1.3.6 1.3 1.3v3.2c0 .7-.6 1.3-1.3 1.3s-1.3-.6-1.3-1.3V17c0-.7.6-1.3 1.3-1.3Zm9.5-5c0 .7-.6 1.3-1.3 1.3H17c-.7 0-1.3-.6-1.3-1.3s.6-1.3 1.3-1.3h3.2c.7 0 1.3.6 1.3 1.3Zm-13.2 0c0 .7-.6 1.3-1.3 1.3H3.8c-.7 0-1.3-.6-1.3-1.3s.6-1.3 1.3-1.3H7c.7 0 1.3.6 1.3 1.3Zm8.1-5.6c.5.5.5 1.3 0 1.9L14.1 9.3c-.5.5-1.3.5-1.9 0s-.5-1.3 0-1.9l2.3-2.3c.5-.5 1.3-.5 1.9 0Zm-8.8 8.8c.5.5.5 1.3 0 1.9l-2.3 2.3c-.5.5-1.3.5-1.9 0s-.5-1.3 0-1.9l2.3-2.3c.5-.5 1.3-.5 1.9 0Zm8.8 1.9c-.5.5-1.3.5-1.9 0l-2.3-2.3c-.5-.5-.5-1.3 0-1.9s1.3-.5 1.9 0l2.3 2.3c.5.5.5 1.3 0 1.9Zm-8.8-8.8c-.5.5-1.3.5-1.9 0L3.4 4.7c-.5-.5-.5-1.3 0-1.9s1.3-.5 1.9 0l2.3 2.3c.5.5.5 1.3 0 1.9Z",
    viewBox: "0 0 24 24",
  },
  keepa: {
    path: "M5 5.5h4.2c2.5 0 4.4 1.8 4.4 4.2S11.7 14 9.2 14H7.4v4.5H5V5.5Zm2.4 2v4h1.6c1.3 0 2.1-.8 2.1-2s-.8-2-2.1-2H7.4Zm8.4-2h2.4v13h-2.4v-13Z",
    viewBox: "0 0 24 24",
  },
  sprite: {
    path: "M12 3c4.5 0 8 2.8 8 6.6 0 2.8-1.8 5-4.6 6l-1.7 3-1.5-2.4h-.2c-4.5 0-8-2.8-8-6.6S7.5 3 12 3Zm-2.1 4.1a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm4.2 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm-4.8 4.5c.8.9 1.8 1.3 2.7 1.3 1 0 2-.4 2.8-1.3",
    viewBox: "0 0 24 24",
  },
  search: {
    path: "M15.5 14h-.8l-.3-.3a5.5 5.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5-5-5Zm-5 0A3.5 3.5 0 1 1 10.5 7a3.5 3.5 0 0 1 0 7Z",
    viewBox: "0 0 24 24",
  },
  store: {
    path: "M4 6.5 5.2 3h13.6L20 6.5v2a2.5 2.5 0 0 1-1.8 2.4V20H5.8v-9.1A2.5 2.5 0 0 1 4 8.5v-2Zm3.2 0h9.6l-.5-1.5H7.7l-.5 1.5Zm1.1 5.4V18h7.4v-6.1a4.5 4.5 0 0 1-7.4 0Z",
    viewBox: "0 0 24 24",
  },
  patent: {
    path: "M6 4h8.5L20 9.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm8 1.8V10h4.2L14 5.8ZM9 13h6v1.8H9V13Zm0 3.5h6V18H9v-1.5Z",
    viewBox: "0 0 24 24",
  },
  jimu: {
    path: "M12 3 7 6v6c0 4 2.3 7.7 5 9 2.7-1.3 5-5 5-9V6l-5-3Zm0 3.1 2.5 1.5v4.1L12 13.2 9.5 11.7V7.6L12 6.1Z",
    viewBox: "0 0 24 24",
  },
  grid: {
    path: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",
    viewBox: "0 0 24 24",
  },
};

export function PlatformLogo({ name, color, className }: PlatformLogoProps) {
  const icon = iconMap[name] ?? iconMap.grid;
  return (
    <svg
      viewBox={icon.viewBox ?? "0 0 24 24"}
      aria-hidden="true"
      className={className}
      fill={color}
    >
      <path d={icon.path} />
    </svg>
  );
}
