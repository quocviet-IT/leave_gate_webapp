import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ApprovalQueue from "@/components/admin/ApprovalQueue";
import type { QueueRow } from "@/lib/services/approvals";

/**
 * The admin screens sit behind Google sign-in, so `smoke-pages.mjs` only ever
 * sees their redirect — a component that throws while rendering would reach
 * production unnoticed, which is exactly how the filing form shipped broken.
 *
 * Rendering the client component to static markup here is the substitute: it
 * exercises the same code path a browser would, without a session. Effects do
 * not run, so the realtime subscription stays out of it; everything that reads
 * state or props during render is covered.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

vi.mock("@/lib/db/client", () => ({
  createSupabaseBrowserClient: () => {
    throw new Error("the queue must not reach Supabase during render");
  },
}));

const DIEU = "dieu@ctyhp.vn";
const TRAN = "tran@ctyhp.vn";
const NOW = new Date("2026-07-30T11:30:00+07:00");

function leaveRow(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    code: "NP-2607-0148",
    kind: "leave",
    status: "pending",
    version: 0,
    submitted_at: "2026-07-30T02:00:00.000Z",
    claimed_by_email: null,
    claimed_at: null,
    decided_by_email: null,
    decided_at: null,
    decision_note: null,
    computed_minutes: 480,
    filed_by_email: null,
    employee_snapshot: { full_name: "Phạm Văn Công Nhân", title: "Công nhân", department: "Sản xuất" },
    subject_email: null,
    leave: {
      from_date: "2026-07-30",
      to_date: "2026-07-30",
      half_day: null,
      reason: "annual",
      reason_text: null,
      note: "Về quê",
    },
    gate: null,
    ...overrides,
  };
}

function gateRow(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    ...leaveRow(),
    id: "22222222-2222-4222-8222-222222222222",
    code: "RC-2607-0031",
    kind: "gate",
    computed_minutes: 180,
    leave: null,
    gate: {
      reason: "business_trip",
      reason_text: null,
      note: "Giao hàng",
      out_at: "2026-07-30T02:00:00.000Z",
      expected_in_at: "2026-07-30T05:00:00.000Z",
    },
    ...overrides,
  };
}

function render(rows: QueueRow[], email = DIEU) {
  return renderToStaticMarkup(
    <ApprovalQueue
      rows={rows}
      email={email}
      serverNow={NOW.toISOString()}
      holderNames={{ [DIEU]: "Chị Diệu", [TRAN]: "Chị Trân" }}
    />,
  );
}

describe("the approval queue renders", () => {
  it("an empty queue without throwing", () => {
    const html = render([]);
    expect(html).toContain("Hàng chờ duyệt");
    expect(html).toContain("Không có đơn nào trong tab này");
  });

  it("a pending leave request with its buttons", () => {
    const html = render([leaveRow()]);
    expect(html).toContain("NP-2607-0148");
    expect(html).toContain("Phạm Văn Công Nhân");
    expect(html).toContain("Nhận xử lý");
    expect(html).toContain("Duyệt");
    expect(html).toContain("Từ chối");
  });

  it("a gate pass, whose detail lives in a different table", () => {
    const html = render([gateRow()]);
    expect(html).toContain("RC-2607-0031");
    expect(html).toContain("Ra vào cổng");
  });

  it("a request this approver holds, with the countdown", () => {
    const html = render([
      leaveRow({
        status: "claimed",
        claimed_by_email: DIEU,
        claimed_at: "2026-07-30T04:20:00.000Z", // 11:20 ICT, ten minutes before NOW
        version: 1,
      }),
    ]);
    expect(html).toContain("Bạn đang giữ");
    expect(html).toContain("còn 20 phút");
    expect(html).toContain("Trả lại hàng chờ");
  });

  it("a request somebody else holds, named and without a claim button", () => {
    const html = render([
      leaveRow({
        status: "claimed",
        claimed_by_email: TRAN,
        claimed_at: "2026-07-30T04:20:00.000Z",
        version: 1,
      }),
    ]);
    expect(html).toContain("Chị Trân đang xử lý");
    expect(html).not.toContain("Nhận xử lý");
  });

  it("the approver's own request, with no decision buttons at all — rule 9", () => {
    const html = render([leaveRow({ subject_email: DIEU })]);
    expect(html).toContain("Đơn của chính bạn");
    expect(html).not.toContain("Nhận xử lý");
    expect(html).not.toContain("Từ chối");
  });

  it("a request that is missing its detail row, rather than throwing", () => {
    const html = render([leaveRow({ leave: null })]);
    expect(html).toContain("NP-2607-0148");
  });
});
