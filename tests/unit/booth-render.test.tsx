import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BoothBoard from "@/components/booth/BoothBoard";
import BoothPinForm from "@/components/booth/BoothPinForm";
import type { BoothRow } from "@/lib/domain/booth";

/**
 * The booth screen is behind a PIN, so `smoke-pages.mjs` only ever sees its
 * sign-in card — the board itself never renders there. This covers the half a
 * guard actually uses.
 *
 * The last test is the one that matters most: rules 14 and 19 say a leave
 * reason must never appear at the gate, and the way to keep that true is for
 * the component to have no field that could carry one.
 */

const NOW = new Date("2026-07-30T12:12:00+07:00");

function row(overrides: Partial<BoothRow> = {}): BoothRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    code: "RC-2607-0031",
    full_name: "Đỗ Thị Ra Cổng",
    department: "Sản xuất",
    out_at: "2026-07-30T02:00:00.000Z",
    expected_in_at: "2026-07-30T05:00:00.000Z",
    booth_out_at: null,
    booth_in_at: null,
    ...overrides,
  };
}

function board(rows: BoothRow[]) {
  return renderToStaticMarkup(
    <BoothBoard boothName="Bốt cổng chính" rows={rows} serverNow={NOW.toISOString()} />,
  );
}

describe("the booth screen renders", () => {
  it("the PIN card before a shift is open", () => {
    const html = renderToStaticMarkup(<BoothPinForm />);
    expect(html).toContain("Bốt bảo vệ");
    expect(html).toContain("Mở ca");
  });

  it("an empty board without throwing", () => {
    const html = board([]);
    expect(html).toContain("Bốt cổng chính");
    expect(html).toContain("Hôm nay không có giấy ra vào cổng nào");
  });

  it("a person who has not left yet, with Cho ra enabled", () => {
    const html = board([row()]);
    expect(html).toContain("Đỗ Thị Ra Cổng");
    expect(html).toContain("Chưa ra");
    expect(html).toContain("Cho ra");
    expect(html).toContain("Cho vào");
  });

  it("a person outside, with the undo still offered", () => {
    const html = board([row({ booth_out_at: "2026-07-30T05:10:00.000Z" })]);
    expect(html).toContain("Đang ở ngoài");
    expect(html).toContain("Hoàn tác Cho ra");
  });

  it("a person back, past the undo window, with no undo button", () => {
    const html = board([
      row({
        booth_out_at: "2026-07-30T02:05:00.000Z",
        booth_in_at: "2026-07-30T04:00:00.000Z", // 11:00 ICT, over an hour before NOW
      }),
    ]);
    expect(html).toContain("Đã về");
    expect(html).not.toContain("Hoàn tác");
  });

  it("nothing about why anybody is going out — rules 14 and 19", () => {
    const html = board([row(), row({ id: "b", code: "RC-2607-0032" })]);
    for (const forbidden of ["Lý do", "Nghỉ phép", "công tác", "khám", "Diễn giải"]) {
      expect(html).not.toContain(forbidden);
    }
  });
});
