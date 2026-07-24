import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { config } from "@/lib/config";
import "./globals.css";

// Runs before paint to set the theme, avoiding a light/dark flash on load.
const themeBoot = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();`;

// Runs before paint to hide groups the visitor previously collapsed, so they
// never flash open during hydration. Keyed on `data-group` (present in the
// server HTML); the Overview removes this <style> once React takes over. Mirrors
// the theme boot above. See components/Overview.tsx.
const groupBoot = `(function(){try{var r=localStorage.getItem('probeview:collapsed-groups');if(!r)return;var n=JSON.parse(r);if(!Array.isArray(n)||!n.length)return;var c=n.map(function(g){var e=String(g).replace(/[\\\\"]/g,'\\\\$&');return '[data-group="'+e+'"] ul{display:none!important}[data-group="'+e+'"] svg{transform:none!important;rotate:none!important}';}).join('');var s=document.createElement('style');s.id='group-collapse-boot';s.textContent=c;document.head.appendChild(s);}catch(e){}})();`;

// Footer links: brighter than the surrounding muted text, underlined, with a
// hover state — so they read as links rather than plain text.
const footerLink =
  "text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground transition-colors";

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
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, non-user-controlled boot script that must run before paint to prevent collapsed groups flashing open */}
        <script dangerouslySetInnerHTML={{ __html: groupBoot }} />
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
          <div className="mx-auto w-full max-w-3xl px-5 py-6 text-sm text-muted flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span>
                {config.siteName} · {config.tagline}
              </span>
              <span>
                <a
                  className={footerLink}
                  href={config.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {config.appName}
                </a>
                {" · Built by "}
                <a
                  className={footerLink}
                  href={config.builtByUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {config.builtByName}
                </a>
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
