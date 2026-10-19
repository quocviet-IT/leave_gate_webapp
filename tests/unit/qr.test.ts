import { describe, expect, it } from "vitest";
import { qrSvg } from "@/lib/qr";

describe("QR rendering", () => {
  it("returns an inline SVG", async () => {
    const svg = await qrSvg("https://example.com/don");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("encodes different text differently", async () => {
    expect(await qrSvg("a".repeat(20))).not.toBe(await qrSvg("b".repeat(20)));
  });

  it("refuses empty text rather than rendering a meaningless code", async () => {
    await expect(qrSvg("")).rejects.toThrow();
  });
});
