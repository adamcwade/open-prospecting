import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Open Prospecting",
  description: "Open-source prospecting and outbound calling tool.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-background text-text-primary">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border-soft bg-background/80 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-primary" />
            <span className="font-display text-lg font-semibold">Open Prospecting</span>
          </div>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/" className="text-text-secondary hover:text-text-primary">
              Overview
            </Link>
            <Link href="/calls" className="text-text-secondary hover:text-text-primary">
              Call history
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
