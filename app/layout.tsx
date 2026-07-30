import type { Metadata, Viewport } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import Providers from "./providers";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
