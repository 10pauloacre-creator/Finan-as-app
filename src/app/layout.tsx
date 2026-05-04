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
    icon: '/icon.png',
    apple: '/apple-icon.png',
    shortcut: '/icon.png',
  },
  openGraph: {
    title: 'FinanceiroIA',
    description: 'Controle financeiro pessoal com Inteligência Artificial',
    images: [{ url: '/icon.png', width: 1688, height: 1688 }],
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
      <body className={`${ibmPlexSans.variable} font-[family-name:var(--font-ibm)] min-h-screen antialiased`}
            style={{ color: '#F1F5F9' }}>
        <div
          className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/bg.png')" }}
        />
        <div className="fixed inset-0 -z-10 bg-[#080B14]/80" />
        {children}
      </body>
    </html>
  );
}
