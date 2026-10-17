import type { Metadata } from "next";
import { bricolage } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Draw & Models Guess",
  description: "One person draws, everyone's model guesses. Three tries each, then the pencil passes on.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={bricolage.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
