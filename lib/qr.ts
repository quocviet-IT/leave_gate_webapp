import QRCode from "qrcode";

/**
 * A QR code as an inline SVG string, rendered on the server.
 *
 * Server-side on purpose: a QR library in the browser would cost the public
 * zone tens of kilobytes for a picture that never changes.
 */
export async function qrSvg(text: string): Promise<string> {
  if (text.trim() === "") throw new Error("Không thể tạo mã QR cho nội dung rỗng");
  return QRCode.toString(text, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#17202e", light: "#ffffff" },
  });
}
