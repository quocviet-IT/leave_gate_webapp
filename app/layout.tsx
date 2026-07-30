import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nhân sự CTYHP — Nghỉ phép & Ra vào cổng",
  description: "Gửi đơn xin nghỉ phép và giấy ra vào cổng, duyệt đơn, xác nhận tại cổng, chấm công.",
};

/** Most people file a request on a phone at the workshop, so meta viewport matters. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Root layout, deliberately empty of UI framework.
 *
 * Ant Design ships a large client bundle, and putting its registry here would
 * charge that cost to the public form — the one screen that opens on a worker's
 * phone on factory wifi, with a 60 KB budget. The registry therefore lives in
 * `app/admin/layout.tsx` and `app/bao-ve/layout.tsx`, which are the zones allowed
 * to pay for it.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
