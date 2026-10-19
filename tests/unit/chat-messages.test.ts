import { describe, expect, it } from "vitest";
import {
  decisionMessage,
  filedMessage,
  gatePassCancelledMessage,
  gatePassMessage,
  reminderMessage,
  withdrawnMessage,
  type RequestForChat,
} from "@/lib/domain/chat-messages";

const QUEUE = "https://ctyhp-nhansu.vercel.app/admin/duyet-don";

const LEAVE: RequestForChat = {
  code: "NP-2607-0148",
  kind: "leave",
  fullName: "Phạm Văn Công Nhân",
  department: "Sản xuất",
  computedMinutes: 480,
  fromDate: "2026-07-30",
  toDate: "2026-07-30",
};

const GATE: RequestForChat = {
  code: "RC-2607-0031",
  kind: "gate",
  fullName: "Đỗ Thị Ra Cổng",
  department: "Sản xuất",
  computedMinutes: 180,
  outAt: "2026-07-30T02:00:00.000Z", // 09:00 ICT
  expectedInAt: "2026-07-30T05:00:00.000Z", // 12:00 ICT
};

describe("a new request reaches the approvers", () => {
  const message = filedMessage(LEAVE, QUEUE);

  it("in the approvers' space, threaded on the request code", () => {
    expect(message.space).toBe("approvers");
    expect(message.threadKey).toBe("NP-2607-0148");
  });

  it("with who, when and how long", () => {
    expect(message.text).toContain("Phạm Văn Công Nhân");
    expect(message.text).toContain("30/07/2026");
    expect(message.text).toContain("8 giờ");
  });

  it("and a way into the queue", () => {
    expect(message.text).toContain(QUEUE);
  });
});

describe("the SLA nudges", () => {
  it("are gentle at one working hour", () => {
    const message = reminderMessage(LEAVE, 1, ["Chị Diệu"], QUEUE);
    expect(message.text).toContain("1 giờ làm việc");
    expect(message.text).not.toContain("Chị Diệu");
  });

  it("name all four at two working hours", () => {
    const message = reminderMessage(
      LEAVE,
      2,
      ["Chị Diệu", "Chị Phúc", "Chị Trân", "Chị Hạnh"],
      QUEUE,
    );
    expect(message.text).toContain("2 giờ làm việc");
    expect(message.text).toContain("Chị Diệu");
    expect(message.text).toContain("Chị Hạnh");
  });

  it("stay in the approvers' thread for that request", () => {
    expect(reminderMessage(GATE, 2, [], QUEUE)).toMatchObject({
      space: "approvers",
      threadKey: "RC-2607-0031",
    });
  });
});

describe("a decision goes back into the same thread", () => {
  it("naming who approved", () => {
    const message = decisionMessage(LEAVE, "approved", "Chị Trân");
    expect(message.threadKey).toBe("NP-2607-0148");
    expect(message.text).toContain("Chị Trân");
    expect(message.text).toContain("đã duyệt");
  });

  it("and keeping a rejection reason out of the room — rule 10", () => {
    const message = decisionMessage(LEAVE, "rejected", "Chị Trân");
    expect(message.text).toContain("đã từ chối");
    expect(message.text).toContain("đường dẫn theo dõi");
  });

  it("and saying plainly when the employee withdrew it", () => {
    expect(withdrawnMessage(LEAVE).text).toContain("đã rút đơn");
  });
});

describe("the guards' space", () => {
  const message = gatePassMessage(GATE)!;

  it("gets approved gate passes, with the name, the times and the code", () => {
    expect(message.space).toBe("guards");
    expect(message.text).toContain("RC-2607-0031");
    expect(message.text).toContain("Đỗ Thị Ra Cổng");
    expect(message.text).toContain("09:00");
    expect(message.text).toContain("12:00");
  });

  it("never gets a leave request at all", () => {
    expect(gatePassMessage(LEAVE)).toBe(null);
    expect(gatePassCancelledMessage(LEAVE)).toBe(null);
  });

  it("is told when a gate pass is cancelled", () => {
    expect(gatePassCancelledMessage(GATE)!.text).toContain("không cho ra cổng");
  });

  it("never carries a reason or a note — rules 14 and 19", () => {
    const withReason = { ...GATE, note: "Đi khám bệnh", reason: "leave" } as RequestForChat & {
      note: string;
      reason: string;
    };
    for (const built of [gatePassMessage(withReason), gatePassCancelledMessage(withReason)]) {
      expect(built!.text).not.toContain("khám");
      expect(built!.text).not.toContain("Lý do");
    }
  });
});

describe("every message a guard can see", () => {
  it("comes from a function that takes no reason field", () => {
    // The composer is given the whole request; what keeps a reason out is that
    // the guard messages never read one. If that changes, this fails.
    const source = [gatePassMessage(GATE)!.text, gatePassCancelledMessage(GATE)!.text].join("\n");
    for (const forbidden of ["business_trip", "Diễn giải", "Ghi rõ"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
