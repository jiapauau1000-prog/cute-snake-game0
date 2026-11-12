import type { Metadata, Viewport } from 'next';
import { Fraunces, Noto_Sans_TC, Noto_Serif_TC } from 'next/font/google';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-brand-loaded',
  display: 'swap',
});

const notoSans = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-body-loaded',
  display: 'swap',
});

const notoSerif = Noto_Serif_TC({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display-loaded',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '漫旅 — 旅遊行程規劃',
  description: '和旅遊同伴一起規劃下一趟旅程，含地圖導航與照片',
  applicationName: '漫旅',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0B4F6C',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" className={`${fraunces.variable} ${notoSans.variable} ${notoSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
