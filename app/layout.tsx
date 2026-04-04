import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import "tdesign-web-components/lib/style/index.css";
import "./globals.css";
import { PlatformAgentProvider } from "@/components/platform-agent-provider";
import { SuppressNextDevOverlay } from "@/components/suppress-next-dev-overlay";

export const metadata: Metadata = {
  title: "More Data Agent",
  description: "More Data Agent mock-first research workspace demo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      style={
        {
          "--font-geist-sans": '"SF Pro Text","Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',
          "--font-geist-mono": '"SFMono-Regular","JetBrains Mono","Menlo","Monaco",monospace',
          "--font-jakarta": '"SF Pro Display","Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',
        } as CSSProperties
      }
    >
      <body className="min-h-full flex flex-col">
        <SuppressNextDevOverlay />
        <PlatformAgentProvider>{children}</PlatformAgentProvider>
      </body>
    </html>
  );
}
