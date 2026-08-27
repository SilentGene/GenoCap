import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import 'antd/dist/reset.css';
import './globals.css';

const repository = process.env.GITHUB_REPOSITORY?.split('/');
const siteUrl = repository?.length === 2
  ? `https://${repository[0]}.github.io/${repository[1]}/`
  : 'http://localhost:3000';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });
const jetbrainsMono = JetBrains_Mono({ variable: '--font-jetbrains-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'GenoCap · Explore Genome Capabilities',
  description: 'Explore genome capabilities from KEGG functional profiles in your browser.',
  icons: {
    icon: './favicon.svg',
  },
  openGraph: {
    title: 'GenoCap',
    description: 'Explore Genome Capabilities',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'GenoCap KEGG functional profiling matrix' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GenoCap',
    description: 'Explore Genome Capabilities',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${inter.variable} ${jetbrainsMono.variable}`}>{children}</body></html>;
}
