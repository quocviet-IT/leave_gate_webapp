import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import OverviewPanel from "@/components/admin/OverviewPanel";
import type { Overview } from "@/lib/services/overview";

/**
 * The overview sits behind sign-in, so the page smoke only ever sees its
 * redirect. This renders it the way a browser would.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

function counts(overrides: Partial<Overview> = {}): Overview {
  return {
    pending: 7,
    unclaimed: 5,
    overdue: 0,
    leaveMinutes: 1440,
    gateMinutes: 360,
    unmarked: 3,
    gatePassesToday: 2,
    awaitingGateReturn: 0,
    ...overrides,
  };
}

describe("the overview renders", () => {
  it("its tiles for an approver", () => {
    const html = renderToStaticMarkup(
      <OverviewPanel counts={counts()} role="approver" from="2026-07-01" to="2026-07-31" />,
    );
    expect(html).toContain("Tổng quan");
    expect(html).toContain("Đang chờ quyết định");
    expect(html).toContain("Ra cổng hôm nay");
  });

  it("a warning only when something is actually overdue", () => {
    const quiet = renderToStaticMarkup(
      <OverviewPanel counts={counts()} role="approver" from="2026-07-01" to="2026-07-31" />,
    );
    expect(quiet).not.toContain("đã quá 2 giờ làm việc");

    const loud = renderToStaticMarkup(
      <OverviewPanel
        counts={counts({ overdue: 2 })}
        role="approver"
        from="2026-07-01"
        to="2026-07-31"
      />,
    );
    expect(loud).toContain("2 đơn đã quá 2 giờ làm việc");
  });

  it("no link into a screen the role cannot open", () => {
    // C&B never decides a request, so the overview must not offer the queue.
    const cnb = renderToStaticMarkup(
      <OverviewPanel counts={counts()} role="cnb" from="2026-07-01" to="2026-07-31" />,
    );
    expect(cnb).not.toContain("/admin/duyet-don");

    // And an approver never edits the timesheet.
    const approver = renderToStaticMarkup(
      <OverviewPanel counts={counts()} role="approver" from="2026-07-01" to="2026-07-31" />,
    );
    expect(approver).not.toContain("/admin/cham-cong");
  });

  it("counts only — never a name or a reason", () => {
    const html = renderToStaticMarkup(
      <OverviewPanel counts={counts()} role="cnb" from="2026-07-01" to="2026-07-31" />,
    );
    for (const word of ["Lý do", "Diễn giải"]) {
      expect(html).not.toContain(word);
    }
  });
});
