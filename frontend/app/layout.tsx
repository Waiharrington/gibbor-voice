import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { AgentStatusProvider } from "@/providers/AgentStatusContext";

const poppins = Poppins({
  weight: ['400', '500', '600', '700'],
  subsets: ["latin"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Alta-Voz | Soluciones de Telefonía Moderna",
  description: "Plataforma avanzada de comunicación y gestión de llamadas",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#0891b2" />
      </head>
      <body
        className={`${poppins.variable} font-sans antialiased`}
      >
        <AgentStatusProvider>
          {children}
        </AgentStatusProvider>
      </body>
    </html>
  );
}
