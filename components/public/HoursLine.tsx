"use client";

import { useEffect, useState } from "react";
import {
  computeGateMinutes,
  computeLeaveMinutes,
  countLeaveWorkingDays,
  minutesToHours,
} from "@/lib/domain/workhours";

type HoursLineProps = {
  formId: string;
  kind: "leave" | "gate";
};

function ictInstant(value: string): Date {
  return new Date(`${value}:00+07:00`);
}

function calculate(form: HTMLFormElement, kind: "leave" | "gate"): string {
  const data = new FormData(form);

  if (kind === "leave") {
    const fromDate = String(data.get("fromDate") ?? "");
    const toDate = String(data.get("toDate") ?? "");
    const halfDay = String(data.get("halfDay") ?? "") as "" | "morning" | "afternoon";
    if (!fromDate || !toDate) return "Chọn ngày để xem số giờ";
    const span = { fromDate, toDate, halfDay: halfDay || null };
    const minutes = computeLeaveMinutes(span);
    const days = countLeaveWorkingDays(span);
    return `${days.toLocaleString("vi-VN")} ngày làm việc | ${minutesToHours(minutes).toLocaleString(
      "vi-VN",
    )} giờ`;
  }

  const outAt = String(data.get("outAt") ?? "");
  const expectedInAt = String(data.get("expectedInAt") ?? "");
  if (!outAt || !expectedInAt) return "Chọn giờ ra và giờ vào lại";
  const minutes = computeGateMinutes(ictInstant(outAt), ictInstant(expectedInAt));
  return `${minutesToHours(minutes).toLocaleString("vi-VN")} giờ trong thời gian làm việc`;
}

export default function HoursLine({ formId, kind }: HoursLineProps) {
  const [text, setText] = useState(
    kind === "leave" ? "Chọn ngày để xem số giờ" : "Chọn giờ ra và giờ vào lại",
  );

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;

    const update = () => {
      try {
        setText(calculate(form, kind));
      } catch (cause) {
        setText(cause instanceof Error ? cause.message : "Thời gian chưa hợp lệ");
      }
    };

    update();
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, [formId, kind]);

  return (
    <output className="hours-line" aria-live="polite">
      <span>Thời gian tính công</span>
      <strong>{text}</strong>
      <small>8 giờ/ngày, không tính giờ nghỉ trưa và Chủ nhật</small>
    </output>
  );
}
