import { describe, expect, it } from "vitest";
import {
  GATE_REASONS,
  GATE_REASON_OPTIONS,
  LEAVE_REASONS,
  LEAVE_REASON_OPTIONS,
  needsReasonText,
} from "@/lib/domain/reasons";

/**
 * The reason codes, the labels the form offers for them, and the rule about
 * which ones oblige a written explanation — all in one module that imports
 * nothing, so a client component can read the rule without dragging the
 * validation library into the public bundle. That is not a style preference:
 * it cost `/don` 65 KB the first time it was written the other way.
 */

describe("the form offers exactly the reasons the server accepts", () => {
  it("for leave", () => {
    expect(LEAVE_REASON_OPTIONS.map(([code]) => code)).toEqual([...LEAVE_REASONS]);
  });

  it("for a gate pass", () => {
    expect(GATE_REASON_OPTIONS.map(([code]) => code)).toEqual([...GATE_REASONS]);
  });

  it("and every option is labelled in Vietnamese", () => {
    for (const [code, label] of [...LEAVE_REASON_OPTIONS, ...GATE_REASON_OPTIONS]) {
      expect(label.trim(), `${code} has no label`).not.toBe("");
    }
  });
});

describe("which reasons force the person to write what they mean", () => {
  it("leave: special and other, and nothing else", () => {
    expect(LEAVE_REASONS.filter((r) => needsReasonText("leave", r))).toEqual(["special", "other"]);
  });

  it("gate: other alone", () => {
    expect(GATE_REASONS.filter((r) => needsReasonText("gate", r))).toEqual(["other"]);
  });

  it("no reason chosen yet asks for nothing", () => {
    expect(needsReasonText("leave", "")).toBe(false);
    expect(needsReasonText("gate", "")).toBe(false);
  });

  it("a leave reason under the gate kind is not carried over", () => {
    // Switching kind clears the reason; if that ever broke, the text box must
    // not still be demanded by a reason the new kind does not even offer.
    expect(needsReasonText("gate", "special")).toBe(false);
  });
});
