import type { Metadata, Viewport } from 'next';

import { CanonicalDomainRedirect } from '@/components/canonical-domain-redirect';
import { AuthProvider } from '@/features/auth/auth-provider';
import { LanguageProvider } from '@/lib/i18n/language-provider';

import './globals.css';

export const metadata: Metadata = {
  title: 'E_trading_N',
  description: 'Personal trading journal and psychology tracking workspace.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeScript = `
    try {
      var settings = JSON.parse(window.localStorage.getItem('e_trading_n:v1:settings') || '{}');
      document.documentElement.classList.toggle('dark', settings.theme === 'dark');
    } catch (_) {}
  `;

  return (
    <html className="min-h-screen bg-background text-ink" dir="rtl" lang="he" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-ink antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <CanonicalDomainRedirect />
        <LanguageProvider>
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
