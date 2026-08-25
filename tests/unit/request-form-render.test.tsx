import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RequestForm from "@/components/public/RequestForm";

/**
 * The public form is the one screen every employee touches, and it ships
 * without a login to hide behind — a component that throws while rendering
 * takes the whole product down. `smoke-pages.mjs` covers `/don` over HTTP;
 * this covers the branches a URL cannot reach, and asserts the shape the
 * redesign promised: one page, one submit button, no steps.
 */

const render = (kind?: "leave" | "gate") =>
  renderToStaticMarkup(<RequestForm initialKind={kind} />);

describe("the filing form is one page", () => {
  it("has a single form and a single submit button", () => {
    const html = render();
    expect(html.match(/<form/g) ?? []).toHaveLength(1);
    expect(html.match(/type="submit"/g) ?? []).toHaveLength(1);
    expect(html).toContain("Gửi đơn");
  });

  it("carries none of the wizard's step furniture", () => {
    const html = render();
    expect(html).not.toContain("Tiếp tục");
    expect(html).not.toContain("Bước 1");
    expect(html).not.toContain("Quay lại");
  });

  it("offers both kinds to choose between", () => {
    const html = render();
    expect(html).toContain("Xin nghỉ phép");
    expect(html).toContain("Ra vào cổng");
  });
});

describe("the person types who they are", () => {
  it("a name, a job title and a department — all three, all required", () => {
    const html = render();
    expect(html).toContain('name="employeeName"');
    expect(html).toContain('name="employeeTitle"');
    expect(html).toContain('name="employeeDepartment"');
    expect(html).toContain("Họ và tên");
    expect(html).toContain("Chức vụ");
    expect(html).toContain("Phòng ban");
  });

  it("with no staff-list picker anywhere on the form", () => {
    const html = render();
    // The picker was a combobox that queried Supabase from the browser. Filing
    // no longer depends on the staff list existing at all.
    expect(html).not.toContain('role="combobox"');
    expect(html).not.toContain("Gõ ít nhất 2 ký tự");
    expect(html).not.toContain('name="employeeId"');
  });

  it("on both kinds — a gate pass needs a name just as much", () => {
    const html = render("gate");
    expect(html).toContain('name="employeeName"');
    expect(html).toContain('name="employeeDepartment"');
  });
});

describe("the form shows the fields for the chosen kind", () => {
  it("leave by default, including what used to be step three", () => {
    const html = render();
    expect(html).toContain("Nghỉ từ ngày");
    expect(html).toContain("Đến hết ngày");
    expect(html).toContain("Lý do nghỉ");
    expect(html).toContain("Bàn giao công việc cho");
    expect(html).toContain('name="handoverName"');
    expect(html).toContain("Tôi cam kết");
    expect(html).toContain('name="makeupDate"');
  });

  it("a gate pass, with no leave field left behind", () => {
    const html = render("gate");
    expect(html).toContain("Thời gian ra");
    expect(html).toContain("Dự kiến vào lại");
    expect(html).not.toContain('name="fromDate"');
    expect(html).not.toContain('name="handoverName"');
    expect(html).not.toContain("Tôi cam kết");
  });

  it("the hours line for whichever kind is showing", () => {
    expect(render()).toContain("Chọn ngày để xem số giờ");
    expect(render("gate")).toContain("Chọn giờ ra và giờ vào lại");
  });
});

describe("the reason text box", () => {
  it("stays hidden until a reason asks for it", () => {
    expect(render()).not.toContain('name="reasonText"');
    expect(render("gate")).not.toContain('name="reasonText"');
  });
});

describe("the form reads as a few short blocks, not one long stack", () => {
  it("names each block of a leave application", () => {
    const html = render();
    expect(html).toContain("Người xin nghỉ");
    expect(html).toContain("Thời gian nghỉ");
    expect(html).toContain("Lý do");
    expect(html).toContain("Bàn giao");
  });

  it("and each block of a gate pass, which has no handover", () => {
    const html = render("gate");
    expect(html).toContain("Người xin phép");
    expect(html).toContain("Thời gian ra vào");
    expect(html).not.toContain("Bàn giao");
  });
});

describe("what is required is not marked; what is optional is", () => {
  it("marks the two optional fields and nothing else", () => {
    const html = render();
    const optionalTags = html.match(/Không bắt buộc/g) ?? [];
    // Handover and the make-up date. Everything else on a leave application is
    // required, so marking the majority would be noise — the exceptions carry
    // the information.
    expect(optionalTags).toHaveLength(2);
  });

  it("a gate pass has no optional field at all", () => {
    expect((render("gate").match(/Không bắt buộc/g) ?? []).length).toBe(0);
  });

  it("asks for a department by the name people use for it", () => {
    const html = render();
    expect(html).toContain("Phòng ban");
    expect(html).not.toContain("Bộ phận / Xưởng");
  });

  it("no longer says the handover was chosen, because it may be blank", () => {
    const html = render();
    expect(html).toContain("Tôi cam kết");
    expect(html).not.toContain("cho người được chọn ở trên");
  });
});
