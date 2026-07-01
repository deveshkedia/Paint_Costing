import "./globals.css";
import { AuthProvider } from "../lib/AuthContext";

// This entire app is authenticated and per-user — nothing here should be
// statically prerendered at build time (every page depends on session state
// that doesn't exist until a real request comes in).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Anupam Paints — Costing & Quoting",
  description: "Internal formulation costing and customer quoting system",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
