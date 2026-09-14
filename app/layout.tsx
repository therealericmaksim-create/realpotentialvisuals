import type { Metadata } from "next";
import { Poppins, Inter } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://realpotentialvisuals.com"),
  title: "RealPotential Visuals — See What Your Property Could Look Like",
  description:
    "AI-powered, human-curated exterior visualizations. See what your property could look like before you renovate, sell, or invest.",
  openGraph: {
    title: "RealPotential Visuals",
    description:
      "See what your property could look like — before you renovate or list it.",
    url: "/",
    siteName: "RealPotential Visuals",
    images: [{ url: "/images/logo.png", width: 2172, height: 724 }],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${poppins.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
