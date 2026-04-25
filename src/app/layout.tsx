import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

// IBM Plex Sans — recomendado pelo design system para fintech/banking
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-ibm',
});

export const metadata: Metadata = {
  title: 'FinanceiroIA',
  description: 'Controle financeiro pessoal com Inteligência Artificial',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FinanceiroIA',
  },
};

export const viewport: Viewport = {
  themeColor: '#7C3AED',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className={`${ibmPlexSans.variable} font-[family-name:var(--font-ibm)] min-h-screen antialiased`}
            style={{ background: '#080B14', color: '#F1F5F9' }}>
        {children}
      </body>
    </html>
  );
}
