import './globals.css';

export const metadata = { title: 'AI Literacy Check', description: 'See how you work with AI, with evidence.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
