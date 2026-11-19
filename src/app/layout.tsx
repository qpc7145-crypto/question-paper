import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Question Paper Bank", template: "%s · Question Paper Bank" },
  description: "Secure examination paper management system",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
