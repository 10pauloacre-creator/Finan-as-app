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
  icons: {
    icon: [
      { url: '/icons/icon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-180x180.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/icons/icon-32x32.png',
  },
  openGraph: {
    title: 'FinanceiroIA',
    description: 'Controle financeiro pessoal com Inteligência Artificial',
    images: [{ url: '/icons/icon-512x512.png', width: 512, height: 512 }],
  },
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
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16x16.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32x32.png" />
        <link rel="icon" type="image/png" sizes="48x48" href="/icons/icon-48x48.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180x180.png" />
      </head>
      <body className={`${ibmPlexSans.variable} font-[family-name:var(--font-ibm)] min-h-screen antialiased`}
            style={{ background: '#080B14', color: '#F1F5F9' }}>
        {children}
      </body>
    </html>
  );
}
