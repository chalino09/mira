import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mira",
  description: "Dashboard operativo para invernaderos de jitomate"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
