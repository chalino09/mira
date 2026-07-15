import type { Metadata } from "next";
import { WorkspaceGate } from "@/components/onboarding/WorkspaceGate";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "mira",
  description: "Dashboard operativo multi-cultivo para áreas productivas"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <WorkspaceGate />
        {children}
      </body>
    </html>
  );
}
