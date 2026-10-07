import type { Metadata } from "next";
import "./globals.css";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import { cn } from "@/lib/utils";

const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap" });
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  axes: ["opsz"],
  display: "swap",
});

const description = "A Stellar invoice that only settles an exact, on-time payment.";

export const metadata: Metadata = {
  metadataBase: new URL("https://due-seven-beryl.vercel.app"),
  title: "Due",
  description,
  openGraph: { title: "Due", description, siteName: "Due", type: "website" },
  twitter: { card: "summary_large_image", title: "Due", description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", hanken.variable, bricolage.variable)}>
      <body>{children}</body>
    </html>
  );
}
