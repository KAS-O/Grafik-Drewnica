import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "../context/AuthContext";

export const metadata: Metadata = {
  title: "Grafik Drewnica",
  description: "Panel grafiku dla Drewnicy"
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <body className="min-h-screen bg-wood-panel antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
