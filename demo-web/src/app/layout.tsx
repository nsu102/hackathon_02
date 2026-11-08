import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// 제품 페이지(product/assets/fonts)와 같은 글꼴. 라이선스: fonts/*-OFL.txt
const instrument = localFont({
  src: [
    { path: "./fonts/InstrumentSerif-Regular.ttf", style: "normal", weight: "400" },
    { path: "./fonts/InstrumentSerif-Italic.ttf", style: "italic", weight: "400" },
  ],
  variable: "--font-instrument",
  display: "swap",
});
const outfit = localFont({
  src: "./fonts/Outfit.ttf",
  weight: "100 900",
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Study Signal Demo",
  description: "PDF를 올려 질문하고, 브라우저 안에서 시선을 추적해 집중을 도와주는 Study Signal 체험판",
};

export const viewport: Viewport = {
  themeColor: "#080b0d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${instrument.variable} ${outfit.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
