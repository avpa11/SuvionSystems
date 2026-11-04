import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Suvion Systems — Environmental Dashboard",
  description: "Maritime vessel sustainability tracking",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to dashboard
        </a>
        {children}
      </body>
    </html>
  );
}
