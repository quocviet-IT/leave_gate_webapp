import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatTime,
  GATE_REASON_LABELS,
  LEAVE_REASON_LABELS,
} from "@/lib/format";
import type { LookupRequest } from "@/lib/services/requests";

/**
 * The two paper forms, reproduced — PRD section IX.
 *
 * Field for field, in the order the sheets have them, because these are the
 * documents the company already knows how to read. What changes is the four
 * signature boxes: the app has a name and a timestamp for each, which is more
 * traceable than a handwritten squiggle, so the boxes are printed filled
 * rather than blank.
 *
 * A Server Component, so no Ant Design here at all — and none is wanted: a
 * printed page should carry the form's own type, not a design system's.
 */

const LEAVE_REASON_ORDER = [
  "unpaid",
  "annual",
  "sick",
  "marriage",
  "maternity",
  "bereavement",
  "special",
  "other",
] as const;

const GATE_REASON_ORDER = ["business_trip", "leave", "other"] as const;

function Tick({ on }: { on: boolean }) {
  return <span className="print-tick">{on ? "☒" : "☐"}</span>;
}

function Line({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <p className="print-line">
      <span className="print-label">{label}</span>
      <span className="print-value">{children}</span>
    </p>
  );
}

function SignatureBox({
  title,
  name,
  at,
}: {
  title: string;
  name?: string | null;
  at?: string | null;
}) {
  return (
    <div className="print-signature">
      <strong>{title}</strong>
      <span className="print-signature-name">{name || "…………………"}</span>
      <small>{at ? `Ngày ${formatDate(at)}` : "Ngày…../…../……."}</small>
    </div>
  );
}

function LeaveSheet({ request }: { request: Extract<LookupRequest, { kind: "leave" }> }) {
  const detail = request.detail;
  const half = detail.halfDay
    ? ` (nửa ngày buổi ${detail.halfDay === "morning" ? "sáng" : "chiều"})`
    : "";

  return (
    <>
      <h1>ĐƠN XIN NGHỈ PHÉP</h1>
      <p className="print-to">Kính gửi: BAN GIÁM ĐỐC CÔNG TY</p>

      <Line label="Tôi tên là:">{request.employee.fullName}</Line>
      <Line label="Chức vụ:">{request.employee.title || ""}</Line>
      <Line label="Phòng/Ban:">{request.employee.department || ""}</Line>

      <p className="print-paragraph">
        Nay tôi làm đơn này kính đề nghị Ban Giám đốc chấp thuận cho tôi được nghỉ phép, cụ thể:
      </p>

      <Line label="Được nghỉ từ ngày">
        {formatDate(detail.fromDate)} đến ngày {formatDate(detail.toDate)}
        {half}
      </Line>
      <Line label="Tổng thời gian nghỉ:">
        {formatDuration(request.computedMinutes, "leave")}
      </Line>

      <p className="print-label">Lý do:</p>
      <div className="print-options">
        {LEAVE_REASON_ORDER.map((reason) => (
          <span key={reason}>
            <Tick on={detail.reason === reason} /> {LEAVE_REASON_LABELS[reason]}
          </span>
        ))}
      </div>
      {detail.reasonText ? <Line label="Ghi rõ:">{detail.reasonText}</Line> : null}
      <Line label="Diễn giải:">{detail.note}</Line>

      <Line label="Công việc của tôi tạm thời bàn giao lại cho:">
        {detail.handoverName || ""}
      </Line>
      <Line label="Đề xuất ngày làm bù (nếu có):">
        {detail.makeupDate ? formatDate(detail.makeupDate) : ""}
      </Line>

      <p className="print-paragraph">
        Tôi cam kết việc nghỉ phép của tôi không ảnh hưởng đến công việc tôi đang phụ trách. Hết
        thời gian nghỉ nêu trên, tôi sẽ trở lại làm việc bình thường.
      </p>
    </>
  );
}

function GateSheet({ request }: { request: Extract<LookupRequest, { kind: "gate" }> }) {
  const detail = request.detail;
  const early = (detail.driftMinutes ?? 0) < 0 ? Math.abs(detail.driftMinutes!) : null;
  const late = (detail.driftMinutes ?? 0) > 0 ? detail.driftMinutes! : null;

  return (
    <>
      <h1>GIẤY XIN PHÉP RA VÀO CỔNG</h1>

      <Line label="Họ và tên CBNV:">{request.employee.fullName}</Line>
      <Line label="Chức vụ:">{request.employee.title || ""}</Line>
      <Line label="Phòng/Ban/Bộ phận:">{request.employee.department || ""}</Line>

      <p className="print-label">Lý do xin phép ra vào cổng:</p>
      <div className="print-options">
        {GATE_REASON_ORDER.map((reason) => (
          <span key={reason}>
            <Tick on={detail.reason === reason} /> {GATE_REASON_LABELS[reason]}
          </span>
        ))}
      </div>
      {detail.reasonText ? <Line label="Ghi rõ:">{detail.reasonText}</Line> : null}
      <Line label="Diễn giải:">{detail.note}</Line>

      <Line label="Thời gian ra:">
        {formatTime(detail.outAt)}, ngày {formatDate(detail.outAt)}
        {detail.boothOutAt ? ` — bảo vệ ghi ${formatTime(detail.boothOutAt)}` : ""}
      </Line>
      <Line label="Thời gian vào lại:">
        {formatTime(detail.expectedInAt)}, ngày {formatDate(detail.expectedInAt)}
        {detail.actualInAt ? ` — thực tế ${formatDateTime(detail.actualInAt)}` : ""}
      </Line>

      <Line label="Thời gian vào sớm:">{early !== null ? `${early} phút` : ""}</Line>
      <Line label="Thời gian vào trễ:">{late !== null ? `${late} phút` : ""}</Line>
      <Line label="Lý do của việc vào sớm/vào trễ:">{detail.driftReason || ""}</Line>
      <Line label="Tổng thời gian ra ngoài:">
        {formatDuration(request.computedMinutes, "gate")}
      </Line>
    </>
  );
}

export default function PrintableRequest({ request }: { request: LookupRequest }) {
  const boothAt =
    request.kind === "gate" ? (request.detail.boothInAt ?? request.detail.boothOutAt) : null;

  return (
    <article className="print-sheet">
      <header className="print-header">
        <div>
          <strong>CÔNG TY CTYHP</strong>
          <div className="print-code">{request.code}</div>
        </div>
        <div className="print-meta">
          Gửi lúc {formatDateTime(request.submittedAt)}
        </div>
      </header>

      {request.kind === "leave" ? (
        <LeaveSheet request={request} />
      ) : (
        <GateSheet request={request} />
      )}

      {/* The four boxes from the paper form. The app fills them with a name and
          a date, which is what replaced the handwritten signature. */}
      <div className="print-signatures">
        <SignatureBox
          title="BAN GIÁM ĐỐC"
          name={request.status === "approved" ? request.decidedBy : null}
          at={request.status === "approved" ? request.decidedAt : null}
        />
        <SignatureBox title="GSNB" />
        <SignatureBox
          title={request.kind === "gate" ? "Bảo vệ tiếp nhận" : "TP/TBP"}
          name={request.kind === "gate" && boothAt ? "Ghi tại cổng" : null}
          at={request.kind === "gate" ? boothAt : null}
        />
        <SignatureBox
          title={request.kind === "gate" ? "CBNV đăng ký" : "NGƯỜI LÀM ĐƠN"}
          name={request.employee.fullName}
          at={request.submittedAt}
        />
      </div>

      {request.kind === "gate" ? (
        <p className="print-note">
          Lưu ý: CB-NV phải nộp lại phiếu này cho Bảo vệ để chuyển về Phòng Nhân sự làm căn cứ tính
          lương.
        </p>
      ) : null}
    </article>
  );
}
