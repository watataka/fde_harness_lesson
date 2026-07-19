import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import NotificationManager from "@/components/notification-manager";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "就業Todo管理",
  description: "就業時間に合わせてTodoの入力・進捗管理・確認を促す個人向けアプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {/* NotificationManagerは特定ページに限定せずアプリ全体をラップする(component-design.md) */}
        <NotificationManager>{children}</NotificationManager>
      </body>
    </html>
  );
}
