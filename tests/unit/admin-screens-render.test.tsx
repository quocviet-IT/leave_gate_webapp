import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import OverviewPanel from "@/components/admin/OverviewPanel";
import OnBehalfForm from "@/components/admin/OnBehalfForm";
import type { Overview } from "@/lib/services/overview";
import type { SupervisorEmployee } from "@/lib/services/supervisor";

/**
 * Both screens are behind Google sign-in, so the page smoke only sees their
 * redirect. These render them the way a browser would.
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

const PEOPLE: SupervisorEmployee[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    fullName: "Trần Văn Xưởng A",
    title: "Công nhân",
    department: "Xưởng A",
  },
];

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
    const supervisor = renderToStaticMarkup(
      <OverviewPanel counts={counts()} role="supervisor" from="2026-07-01" to="2026-07-31" />,
    );
    expect(supervisor).not.toContain("/admin/duyet-don");
    expect(supervisor).not.toContain("/admin/cham-cong");
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

describe("filing on behalf renders", () => {
  it("the form when the supervisor has a workshop with people in it", () => {
    const html = renderToStaticMarkup(<OnBehalfForm employees={PEOPLE} />);
    expect(html).toContain("Tạo đơn hộ");
    expect(html).toContain("Gửi đơn hộ");
  });

  it("an explanation instead of a form when the list is empty", () => {
    const html = renderToStaticMarkup(<OnBehalfForm employees={[]} />);
    expect(html).toContain("Chưa có ai trong danh sách");
    expect(html).not.toContain("Gửi đơn hộ");
  });

  it("no department picker — the workshop is not a choice", () => {
    const html = renderToStaticMarkup(<OnBehalfForm employees={PEOPLE} />);
    expect(html).not.toContain('name="department"');
  });
});
