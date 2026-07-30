import { describe, expect, it } from "vitest";
import { parseEmployeeList } from "@/lib/domain/employees";

describe("parsing a pasted staff list", () => {
  it("reads a tab-separated paste from Excel with a header row", () => {
    const text = [
      "Mã CBNV\tHọ và tên\tChức vụ\tPhòng ban\tEmail",
      "HP-0148\tNguyễn Văn Bình\tCông nhân\tSản xuất\t",
      "HP-0149\tTrần Thị Lan\tCông nhân\tSản xuất\tlan@ctyhp.vn",
    ].join("\n");

    const { rows, issues } = parseEmployeeList(text);

    expect(issues).toEqual([]);
    expect(rows).toEqual([
      {
        code: "HP0148",
        fullName: "Nguyễn Văn Bình",
        title: "Công nhân",
        department: "Sản xuất",
        email: null,
      },
      {
        code: "HP0149",
        fullName: "Trần Thị Lan",
        title: "Công nhân",
        department: "Sản xuất",
        email: "lan@ctyhp.vn",
      },
    ]);
  });

  it("reads a comma-separated list with no header", () => {
    const { rows } = parseEmployeeList("HP-0150,Lê Minh Tuấn,Kỹ thuật viên,Kỹ thuật");
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe("HP0150");
    expect(rows[0].department).toBe("Kỹ thuật");
  });

  it("reads a semicolon-separated list", () => {
    const { rows } = parseEmployeeList("HP-0151;Phạm Thu Hà;Kế toán viên;Kế toán");
    expect(rows[0].fullName).toBe("Phạm Thu Hà");
  });

  it("keeps a comma that sits inside a quoted field", () => {
    const { rows } = parseEmployeeList('HP-0152,"Vũ, Thị Mai",Nhân viên,Hành chính');
    expect(rows[0].fullName).toBe("Vũ, Thị Mai");
  });

  it("survives a BOM, CRLF endings and blank lines", () => {
    const text = "﻿HP-0153\tHoàng Văn Nam\r\n\r\nHP-0154\tĐỗ Thị Yến\r\n";
    const { rows, issues } = parseEmployeeList(text);
    expect(issues).toEqual([]);
    expect(rows.map((r) => r.code)).toEqual(["HP0153", "HP0154"]);
  });

  it("normalises the code and collapses runs of spaces in the name", () => {
    const { rows } = parseEmployeeList("hp 0155\tNguyễn   Thị  Hoa");
    expect(rows[0].code).toBe("HP0155");
    expect(rows[0].fullName).toBe("Nguyễn Thị Hoa");
  });

  it("reports a missing code and drops the row", () => {
    const { rows, issues } = parseEmployeeList("\tNguyễn Văn Bình");
    expect(rows).toEqual([]);
    expect(issues).toEqual([{ line: 1, message: "Thiếu mã CBNV" }]);
  });

  it("reports a missing name and drops the row", () => {
    const { rows, issues } = parseEmployeeList("HP-0156\tA");
    expect(rows).toEqual([]);
    expect(issues).toEqual([{ line: 1, message: "Thiếu họ tên" }]);
  });

  it("reports a duplicate code and keeps the first occurrence", () => {
    const text = ["HP-0157\tNguyễn Văn A", "hp0157\tNguyễn Văn B"].join("\n");
    const { rows, issues } = parseEmployeeList(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].fullName).toBe("Nguyễn Văn A");
    expect(issues).toEqual([{ line: 2, message: "Mã HP0157 đã có ở dòng 1" }]);
  });

  it("reports a malformed email", () => {
    const { rows, issues } = parseEmployeeList("HP-0158\tLý Thị Nga\tNhân viên\tKho\tnga(at)ctyhp.vn");
    expect(rows).toEqual([]);
    expect(issues).toEqual([{ line: 1, message: "Email không hợp lệ: nga(at)ctyhp.vn" }]);
  });

  it("ignores columns past the fifth", () => {
    const { rows } = parseEmployeeList("HP-0159\tBùi Văn Sơn\tThợ\tCơ khí\t\tghi chú thêm");
    expect(rows[0].department).toBe("Cơ khí");
  });

  it("returns nothing for empty input", () => {
    expect(parseEmployeeList("   \n\n")).toEqual({ rows: [], issues: [] });
  });

  it("does not mistake a name starting with 'Mai' for a header", () => {
    const { rows } = parseEmployeeList("HP-0160\tMai Thị Hồng");
    expect(rows).toHaveLength(1);
  });
});
