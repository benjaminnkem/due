import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  );
}
