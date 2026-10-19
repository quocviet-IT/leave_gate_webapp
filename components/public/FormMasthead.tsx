import type { RequestKind } from "./RequestForm";

/**
 * The card names the paper form it is standing in for, and renames itself when
 * the kind changes.
 *
 * These are the two documents' real titles, the ones printed at the top of the
 * sheets in `PrintableRequest` and on the paper in the workshop. Using them
 * here does two things: it tells a worker who has filled these forms for years
 * exactly which one they are looking at, and it makes the kind toggle's effect
 * visible at a glance instead of only changing fields further down.
 */
const TITLES: Record<RequestKind, { name: string; blurb: string }> = {
  leave: {
    name: "ĐƠN XIN NGHỈ PHÉP",
    blurb: "Không cần đăng nhập. Trưởng phòng duyệt trước khi bạn nghỉ.",
  },
  gate: {
    name: "GIẤY XIN PHÉP RA VÀO CỔNG",
    blurb: "Không cần đăng nhập. Bảo vệ ghi giờ thật khi bạn ra và vào cổng.",
  },
};

export default function FormMasthead({ kind }: { kind: RequestKind }) {
  const { name, blurb } = TITLES[kind];
  return (
    <header className="masthead">
      <h1 className="masthead__title">{name}</h1>
      <p className="masthead__blurb">{blurb}</p>
    </header>
  );
}
