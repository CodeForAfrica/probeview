import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { config } from "@/lib/config";
import "./globals.css";

// Runs before paint to set the theme, avoiding a light/dark flash on load.
const themeBoot = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();`;

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${config.siteName} Status`,
  description: `${config.siteName} — ${config.tagline}`,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, non-user-controlled boot script that must run before paint to prevent a theme flash */}
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <header className="border-b border-border">
          <div className="mx-auto w-full max-w-3xl px-5 py-5 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="font-semibold tracking-tight">
                {config.siteName}
              </span>
              <span className="text-muted text-sm">Status</span>
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
          {children}
        </main>

        <footer className="border-t border-border">
          <div className="mx-auto w-full max-w-3xl px-5 py-6 text-sm text-muted flex flex-wrap items-center justify-between gap-2">
            <span>
              {config.siteName} · {config.tagline}
            </span>
            <span>
              Powered by{" "}
              <a
                href="https://grafana.com/products/cloud/synthetic-monitoring/"
                target="_blank"
                rel="noopener"
              >
                Grafana Synthetics
              </a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
