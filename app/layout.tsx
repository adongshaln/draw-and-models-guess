import type { Metadata } from "next";
import { bricolage } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sketch Test · 你画，模型猜",
  description: "一个人画，桌上所有模型来猜。每个模型三次机会，然后换下一个人画。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={bricolage.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
