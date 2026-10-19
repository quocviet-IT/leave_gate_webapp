import { describe, expect, it } from "vitest";
import {
  boothState,
  canStampIn,
  canStampOut,
  canUndo,
  countByState,
  matchesSearch,
  UNDO_WINDOW_MINUTES,
  undoableDirection,
  type BoothRow,
} from "@/lib/domain/booth";

function ict(iso: string): Date {
  return new Date(`${iso}+07:00`);
}

function row(overrides: Partial<BoothRow> = {}): BoothRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    code: "RC-2607-0031",
    full_name: "Đỗ Thị Ra Cổng",
    department: "Sản xuất",
    out_at: ict("2026-07-30T09:00").toISOString(),
    expected_in_at: ict("2026-07-30T12:00").toISOString(),
    booth_out_at: null,
    booth_in_at: null,
    ...overrides,
  };
}

describe("where the gate thinks a person is", () => {
  it("waiting before either tap", () => {
    expect(boothState(row())).toBe("waiting");
  });

  it("outside after Cho ra", () => {
    expect(boothState(row({ booth_out_at: ict("2026-07-30T09:05").toISOString() }))).toBe("outside");
  });

  it("returned after Cho vào", () => {
    expect(
      boothState(
        row({
          booth_out_at: ict("2026-07-30T09:05").toISOString(),
          booth_in_at: ict("2026-07-30T12:10").toISOString(),
        }),
      ),
    ).toBe("returned");
  });
});

describe("Cho ra must come before Cho vào", () => {
  it("offers only Cho ra at the start", () => {
    expect(canStampOut(row())).toBe(true);
    expect(canStampIn(row())).toBe(false);
  });

  it("offers only Cho vào once the person is outside", () => {
    const outside = row({ booth_out_at: ict("2026-07-30T09:05").toISOString() });
    expect(canStampOut(outside)).toBe(false);
    expect(canStampIn(outside)).toBe(true);
  });

  it("offers neither once both taps are in", () => {
    const done = row({
      booth_out_at: ict("2026-07-30T09:05").toISOString(),
      booth_in_at: ict("2026-07-30T12:10").toISOString(),
    });
    expect(canStampOut(done)).toBe(false);
    expect(canStampIn(done)).toBe(false);
  });
});

describe("the five-minute undo", () => {
  const tapped = ict("2026-07-30T09:05");

  it("is the five minutes the PRD promises", () => {
    expect(UNDO_WINDOW_MINUTES).toBe(5);
  });

  it("holds right up to the fifth minute", () => {
    expect(canUndo(tapped, ict("2026-07-30T09:10"))).toBe(true);
  });

  it("closes a second later", () => {
    expect(canUndo(tapped, ict("2026-07-30T09:10:01"))).toBe(false);
  });

  it("undoes the exit while nothing follows it", () => {
    expect(
      undoableDirection(row({ booth_out_at: tapped.toISOString() }), ict("2026-07-30T09:07")),
    ).toBe("out");
  });

  it("undoes the return first when both taps are in", () => {
    const both = row({
      booth_out_at: tapped.toISOString(),
      booth_in_at: ict("2026-07-30T12:10").toISOString(),
    });
    expect(undoableDirection(both, ict("2026-07-30T12:12"))).toBe("in");
  });

  it("never offers to undo the exit from under a return", () => {
    const both = row({
      booth_out_at: ict("2026-07-30T12:09").toISOString(),
      booth_in_at: ict("2026-07-30T12:10").toISOString(),
    });
    // Both taps are inside their window, but only the later one may go.
    expect(undoableDirection(both, ict("2026-07-30T12:11"))).toBe("in");
  });

  it("offers nothing once the window has closed", () => {
    expect(
      undoableDirection(row({ booth_out_at: tapped.toISOString() }), ict("2026-07-30T09:20")),
    ).toBe(null);
  });
});

describe("the name search", () => {
  const rows = [
    row({ id: "a", full_name: "Đỗ Thị Ra Cổng" }),
    row({ id: "b", full_name: "Nguyễn Văn Bình", code: "RC-2607-0032" }),
  ];

  it("matches without accents, the way a guard types", () => {
    expect(rows.filter((r) => matchesSearch(r, "do thi")).map((r) => r.id)).toEqual(["a"]);
    expect(rows.filter((r) => matchesSearch(r, "nguyen")).map((r) => r.id)).toEqual(["b"]);
  });

  it("matches the request code too", () => {
    expect(rows.filter((r) => matchesSearch(r, "0032")).map((r) => r.id)).toEqual(["b"]);
  });

  it("shows everything when the box is empty", () => {
    expect(rows.filter((r) => matchesSearch(r, "  ")).length).toBe(2);
  });
});

describe("the three counters", () => {
  it("adds up to the whole board", () => {
    const counts = countByState([
      row({ id: "a" }),
      row({ id: "b", booth_out_at: ict("2026-07-30T09:05").toISOString() }),
      row({
        id: "c",
        booth_out_at: ict("2026-07-30T09:05").toISOString(),
        booth_in_at: ict("2026-07-30T12:10").toISOString(),
      }),
    ]);
    expect(counts).toEqual({ waiting: 1, outside: 1, returned: 1 });
  });
});
