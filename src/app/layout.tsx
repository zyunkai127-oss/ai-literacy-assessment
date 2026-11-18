import './globals.css';

export const metadata = { title: 'AI Literacy Check', description: 'See how you work with AI, with evidence.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/plus-jakarta-sans.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
