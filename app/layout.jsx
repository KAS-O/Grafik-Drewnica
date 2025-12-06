import "./globals.css";
import { AuthProvider } from "../context/AuthContext";

export const metadata = {
  title: "Grafik Drewnica",
  description: "Panel grafiku dla Drewnicy"
};

export default function RootLayout({ children }) {
  return (
    <html lang="pl">
      <body className="min-h-screen bg-wood-panel antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
