import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TimesheetTable from "@/components/admin/TimesheetTable";
import type { TimesheetRow } from "@/lib/domain/timesheet";

/**
 * `/admin/cham-cong` is behind Google sign-in, so the page smoke only sees its
 * redirect. This renders the screen the way a browser would.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

function row(overrides: Partial<TimesheetRow> = {}): TimesheetRow {
  return {
    request_id: "11111111-1111-4111-8111-111111111111",
    code: "NP-2607-0148",
    kind: "leave",
    full_name: "Phạm Văn Công Nhân",
    title: "Công nhân",
    department: "Sản xuất",
    computed_minutes: 480,
    final_minutes: 480,
    marked_at: null,
    marked_by_email: null,
    decided_at: "2026-07-30T02:30:00.000Z",
    decided_by_email: "dieu@ctyhp.vn",
    from_date: "2026-07-30",
    to_date: "2026-07-30",
    out_at: null,
    expected_in_at: null,
    actual_in_at: null,
    actual_in_source: null,
    drift_minutes: null,
    drift_reason: null,
    booth_out_at: null,
    booth_in_at: null,
    ...overrides,
  };
}

function render(rows: TimesheetRow[], from = "", to = "") {
  return renderToStaticMarkup(<TimesheetTable rows={rows} from={from} to={to} />);
}

describe("the timesheet renders", () => {
  it("an empty period without throwing", () => {
    const html = render([]);
    expect(html).toContain("Chấm công");
    expect(html).toContain("Không có đơn đã duyệt nào trong khoảng này");
  });

  it("a leave row with both hours columns", () => {
    const html = render([row()]);
    expect(html).toContain("NP-2607-0148");
    expect(html).toContain("Hệ thống tính");
    expect(html).toContain("Đang chốt");
    expect(html).toContain("Tải Excel");
  });

  it("an adjusted row, marked as such", () => {
    const html = render([row({ final_minutes: 240 })]);
    expect(html).toContain("Có điều chỉnh");
  });

  it("a gate pass whose return nobody confirmed at the gate", () => {
    const html = render([
      row({
        request_id: "b",
        code: "RC-2607-0031",
        kind: "gate",
        from_date: null,
        to_date: null,
        out_at: "2026-07-30T02:00:00.000Z",
        expected_in_at: "2026-07-30T05:00:00.000Z",
        actual_in_at: "2026-07-30T05:10:00.000Z",
        actual_in_source: "employee",
      }),
    ]);
    expect(html).toContain("Bảo vệ không bấm");
  });

  it("only the rows inside the filtered period", () => {
    const html = render(
      [row(), row({ request_id: "b", code: "NP-2608-0001", from_date: "2026-08-15", to_date: "2026-08-15" })],
      "2026-08-01",
      "2026-08-31",
    );
    expect(html).toContain("NP-2608-0001");
    expect(html).not.toContain("NP-2607-0148");
  });

  it("no input carrying the computed hours — rule 17 locks them", () => {
    const html = render([row()]);
    expect(html).not.toContain('name="computedHours"');
    expect(html).not.toContain('name="computedMinutes"');
  });
});
