import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrintableRequest from "@/components/public/PrintableRequest";
import type { LookupRequest } from "@/lib/services/requests";

/**
 * PRD section IX: the printed page has to match the paper forms field for
 * field, because those sheets are what the company already knows how to read.
 * These tests hold the wording to the forms rather than to whatever the screen
 * happens to say.
 */

const LEAVE: LookupRequest = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "NP-2607-0148",
  kind: "leave",
  status: "approved",
  employee: { fullName: "Phạm Văn Công Nhân", title: "Công nhân", department: "Sản xuất" },
  submittedAt: "2026-07-29T02:00:00.000Z",
  computedMinutes: 480,
  decidedBy: "Chị Diệu",
  decidedAt: "2026-07-29T03:00:00.000Z",
  detail: {
    fromDate: "2026-07-30",
    toDate: "2026-07-30",
    reason: "annual",
    note: "Về quê giỗ ông",
    handoverName: "Nguyễn Văn Bình",
    makeupDate: "2026-08-01",
  },
};

const GATE: LookupRequest = {
  id: "22222222-2222-4222-8222-222222222222",
  code: "RC-2607-0031",
  kind: "gate",
  status: "approved",
  employee: { fullName: "Đỗ Thị Ra Cổng", title: "Công nhân", department: "Sản xuất" },
  submittedAt: "2026-07-30T01:00:00.000Z",
  computedMinutes: 180,
  decidedBy: "Chị Trân",
  decidedAt: "2026-07-30T01:30:00.000Z",
  detail: {
    reason: "business_trip",
    note: "Giao hàng cho khách",
    outAt: "2026-07-30T02:00:00.000Z", // 09:00 ICT
    expectedInAt: "2026-07-30T05:00:00.000Z", // 12:00 ICT
    actualInAt: "2026-07-30T05:20:00.000Z", // 12:20 ICT — twenty minutes late
    actualInSource: "booth",
    driftMinutes: 20,
    driftReason: "Kẹt xe trên đường về",
    boothOutAt: "2026-07-30T02:01:00.000Z",
    boothInAt: "2026-07-30T05:20:00.000Z",
  },
};

function print(request: LookupRequest) {
  return renderToStaticMarkup(<PrintableRequest request={request} />);
}

describe("the leave sheet", () => {
  const html = print(LEAVE);

  it("carries the form's own heading and salutation", () => {
    expect(html).toContain("ĐƠN XIN NGHỈ PHÉP");
    expect(html).toContain("Kính gửi: BAN GIÁM ĐỐC CÔNG TY");
  });

  it("names every field the paper form asks for", () => {
    for (const label of [
      "Tôi tên là:",
      "Chức vụ:",
      "Phòng/Ban:",
      "Tổng thời gian nghỉ:",
      "Công việc của tôi tạm thời bàn giao lại cho:",
      "Đề xuất ngày làm bù (nếu có):",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("lists all eight reasons, with only the chosen one ticked", () => {
    for (const reason of [
      "Không lương",
      "Phép năm",
      "Ốm đau",
      "Kết hôn",
      "Thai sản",
      "Tang chế",
      "Trường hợp đặc biệt",
    ]) {
      expect(html).toContain(reason);
    }
    expect((html.match(/☒/g) ?? []).length).toBe(1);
    expect((html.match(/☐/g) ?? []).length).toBe(7);
  });

  it("fills in what the employee actually asked for", () => {
    expect(html).toContain("Phạm Văn Công Nhân");
    expect(html).toContain("30/07/2026");
    expect(html).toContain("Nguyễn Văn Bình");
    expect(html).toContain("Về quê giỗ ông");
  });

  it("keeps the commitment sentence from the form", () => {
    expect(html).toContain("tôi sẽ trở lại làm việc bình thường");
  });

  it("prints the four signature boxes, with the approver's name in place", () => {
    expect(html).toContain("BAN GIÁM ĐỐC");
    expect(html).toContain("GSNB");
    expect(html).toContain("TP/TBP");
    expect(html).toContain("NGƯỜI LÀM ĐƠN");
    expect(html).toContain("Chị Diệu");
  });
});

describe("the gate pass sheet", () => {
  const html = print(GATE);

  it("carries the form's own heading", () => {
    expect(html).toContain("GIẤY XIN PHÉP RA VÀO CỔNG");
  });

  it("names every field the paper form asks for", () => {
    for (const label of [
      "Họ và tên CBNV:",
      "Phòng/Ban/Bộ phận:",
      "Lý do xin phép ra vào cổng:",
      "Diễn giải:",
      "Thời gian ra:",
      "Thời gian vào lại:",
      "Thời gian vào sớm:",
      "Thời gian vào trễ:",
      "Lý do của việc vào sớm/vào trễ:",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("splits early and late into the two boxes the form has", () => {
    expect(html).toContain("20 phút");
    expect(html).toContain("Kẹt xe trên đường về");
  });

  it("shows the guard's own times next to the expected ones", () => {
    expect(html).toContain("09:00");
    expect(html).toContain("12:20");
  });

  it("prints the note about handing the slip back", () => {
    expect(html).toContain("nộp lại phiếu này cho Bảo vệ");
  });

  it("replaces the guard's signature box with the time recorded at the gate", () => {
    expect(html).toContain("Bảo vệ tiếp nhận");
    expect(html).toContain("CBNV đăng ký");
  });
});

describe("an early return", () => {
  it("goes in the early box, not the late one", () => {
    const early = print({
      ...GATE,
      detail: { ...GATE.detail, driftMinutes: -25, driftReason: "Xong việc sớm" },
    } as LookupRequest);
    const earlyIndex = early.indexOf("Thời gian vào sớm:");
    const lateIndex = early.indexOf("Thời gian vào trễ:");
    expect(early.slice(earlyIndex, lateIndex)).toContain("25 phút");
    expect(early.slice(lateIndex, lateIndex + 200)).not.toContain("25 phút");
  });
});
