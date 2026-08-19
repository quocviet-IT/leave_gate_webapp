import Link from "next/link";
import ActualReturnForm from "@/components/public/ActualReturnForm";
import WithdrawForm from "@/components/public/WithdrawForm";
import { endOfNextWorkingDay } from "@/lib/domain/workhours";
import {
  formatDate,
  formatDateTime,
  formatDrift,
  formatDuration,
  GATE_REASON_LABELS,
  KIND_LABELS,
  LEAVE_REASON_LABELS,
  STATUS_LABELS,
} from "@/lib/format";
import { lookupRequest, type LookupRequest } from "@/lib/services/requests";
import { serverNow } from "@/lib/server-time";

export const metadata = { title: "Theo dõi đơn - Nhân sự CTYHP" };

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="lookup-detail-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function LeaveDetails({ request }: { request: Extract<LookupRequest, { kind: "leave" }> }) {
  const detail = request.detail;
  return (
    <dl className="lookup-details">
      <DetailRow label="Thời gian nghỉ">
        {formatDate(detail.fromDate)} đến {formatDate(detail.toDate)}
        {detail.halfDay
          ? `, nửa ngày buổi ${detail.halfDay === "morning" ? "sáng" : "chiều"}`
          : ""}
      </DetailRow>
      <DetailRow label="Số giờ">{formatDuration(request.computedMinutes, "leave")}</DetailRow>
      <DetailRow label="Lý do">{LEAVE_REASON_LABELS[detail.reason]}</DetailRow>
      {detail.reasonText ? <DetailRow label="Ghi rõ">{detail.reasonText}</DetailRow> : null}
      <DetailRow label="Diễn giải">{detail.note}</DetailRow>
      <DetailRow label="Bàn giao cho">{detail.handoverName || "Chưa có tên"}</DetailRow>
      {detail.makeupDate ? (
        <DetailRow label="Ngày làm bù đề xuất">{formatDate(detail.makeupDate)}</DetailRow>
      ) : null}
    </dl>
  );
}

function GateDetails({ request }: { request: Extract<LookupRequest, { kind: "gate" }> }) {
  const detail = request.detail;
  return (
    <dl className="lookup-details">
      <DetailRow label="Lý do">{GATE_REASON_LABELS[detail.reason]}</DetailRow>
      {detail.reasonText ? <DetailRow label="Ghi rõ">{detail.reasonText}</DetailRow> : null}
      <DetailRow label="Diễn giải">{detail.note}</DetailRow>
      <DetailRow label="Thời gian ra">{formatDateTime(detail.outAt)}</DetailRow>
      <DetailRow label="Dự kiến vào lại">{formatDateTime(detail.expectedInAt)}</DetailRow>
      <DetailRow label="Số giờ">{formatDuration(request.computedMinutes, "gate")}</DetailRow>
      {detail.boothOutAt ? (
        <DetailRow label="Bảo vệ cho ra">{formatDateTime(detail.boothOutAt)}</DetailRow>
      ) : null}
      {detail.actualInAt ? (
        <>
          <DetailRow label="Giờ vào lại thực tế">{formatDateTime(detail.actualInAt)}</DetailRow>
          <DetailRow label="Chênh lệch">
            {formatDrift(detail.driftMinutes ?? 0)}
            {detail.actualInSource === "booth"
              ? " (bảo vệ ghi)"
              : detail.actualInSource === "employee"
                ? " (nhân viên nhập)"
                : " (C&B điều chỉnh)"}
          </DetailRow>
          {detail.driftReason ? (
            <DetailRow label="Lý do chênh lệch">{detail.driftReason}</DetailRow>
          ) : null}
        </>
      ) : null}
    </dl>
  );
}

export default async function PrivateLookupPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { token: rawToken } = await params;
  const token = rawToken.trim().toLowerCase();
  const query = await searchParams;
  const validToken = /^[0-9a-f]{32}$/.test(token);
  const request = validToken ? await lookupRequest(token) : null;

  if (!request) {
    return (
      <section className="status-lookup">
        <span className="step-kicker">Đường dẫn không hợp lệ</span>
        <h1>Không tìm thấy đơn</h1>
        <p>
          Kiểm tra lại đường dẫn theo dõi đã lưu. Nếu chỉ có mã đơn, bạn vẫn có thể xem trạng thái
          chung.
        </p>
        <Link className="button button--primary" href="/tra-cuu">
          Tra cứu bằng mã đơn
        </Link>
      </section>
    );
  }

  const update = one(query["cap-nhat"]);
  const canWithdraw = request.status === "pending" || request.status === "claimed";
  const gateDeadline =
    request.kind === "gate"
      ? endOfNextWorkingDay(new Date(request.detail.expectedInAt))
      : null;
  const canSetActualReturn =
    request.kind === "gate" &&
    request.status === "approved" &&
    !request.detail.actualInAt &&
    !request.detail.boothInAt &&
    gateDeadline !== null &&
    serverNow().getTime() <= gateDeadline.getTime();

  return (
    <section className="private-lookup">
      {update === "da-rut" ? (
        <div className="success-banner" role="status">
          Đã rút đơn. Người duyệt sẽ không xử lý đơn này nữa.
        </div>
      ) : null}
      {update === "gio-vao" ? (
        <div className="success-banner" role="status">
          Đã lưu giờ vào lại thực tế.
        </div>
      ) : null}

      <header className="lookup-heading">
        <div>
          <span className="step-kicker">{KIND_LABELS[request.kind]}</span>
          <h1>{request.code}</h1>
          <p>Gửi lúc {formatDateTime(request.submittedAt)}</p>
        </div>
        <strong className={`request-status request-status--${request.status}`}>
          {STATUS_LABELS[request.status]}
        </strong>
      </header>

      <section className="lookup-section">
        <h2>Người gửi</h2>
        <div className="identity-summary">
          <strong>{request.employee.fullName}</strong>
          <small>
            {[request.employee.title, request.employee.department].filter(Boolean).join(" | ") ||
              "Chưa có chức vụ và phòng ban"}
          </small>
        </div>
      </section>

      <section className="lookup-section">
        <h2>Thông tin đơn</h2>
        {request.kind === "leave" ? (
          <LeaveDetails request={request} />
        ) : (
          <GateDetails request={request} />
        )}
      </section>

      <section className="lookup-section">
        <h2>Tiến trình xử lý</h2>
        <dl className="lookup-details">
          <DetailRow label="Trạng thái">{STATUS_LABELS[request.status]}</DetailRow>
          {request.claimedBy && request.status === "claimed" ? (
            <DetailRow label="Người đang xử lý">
              {request.claimedBy}
              {request.claimedAt ? `, nhận lúc ${formatDateTime(request.claimedAt)}` : ""}
            </DetailRow>
          ) : null}
          {request.decidedBy ? (
            <DetailRow label="Người quyết định">
              {request.decidedBy}
              {request.decidedAt ? `, lúc ${formatDateTime(request.decidedAt)}` : ""}
            </DetailRow>
          ) : null}
          {request.decisionNote ? (
            <DetailRow label="Ghi chú quyết định">{request.decisionNote}</DetailRow>
          ) : null}
          {request.withdrawnAt ? (
            <DetailRow label="Đã rút lúc">{formatDateTime(request.withdrawnAt)}</DetailRow>
          ) : null}
        </dl>
      </section>

      {canWithdraw ? (
        <section className="lookup-section lookup-section--action">
          <h2>Rút đơn</h2>
          <p>Bạn có thể rút khi đơn còn chờ duyệt hoặc đang được nhận xử lý.</p>
          <WithdrawForm token={token} />
        </section>
      ) : null}

      {request.kind === "gate" && request.status === "approved" ? (
        <section className="lookup-section lookup-section--action">
          <h2>Giờ vào lại thực tế</h2>
          {request.detail.actualInAt ? (
            <p>Giờ vào lại đã được ghi: {formatDateTime(request.detail.actualInAt)}.</p>
          ) : request.detail.boothInAt ? (
            <p>Bảo vệ đã ghi giờ vào tại cổng. Bạn không cần nhập lại.</p>
          ) : canSetActualReturn ? (
            <>
              <p>
                Nếu bảo vệ không bấm Cho vào, hãy nhập trước{" "}
                <strong>{gateDeadline ? formatDateTime(gateDeadline) : ""}</strong>.
              </p>
              <ActualReturnForm token={token} expectedInAt={request.detail.expectedInAt} />
            </>
          ) : (
            <p>
              Đã hết hạn nhập giờ vào lại. Liên hệ C&B để điều chỉnh và ghi lý do.
            </p>
          )}
        </section>
      ) : null}

      {request.status === "approved" ? (
        <section className="lookup-section lookup-section--action">
          <h2>In đơn</h2>
          <p>Bản in theo đúng bố cục mẫu giấy đang dùng, khổ A4.</p>
          <Link className="button button--secondary" href={`/tra-cuu/${token}/in`}>
            Mở bản in
          </Link>
        </section>
      ) : null}

      <aside className="private-link-note">
        <strong>Đây là đường dẫn riêng của đơn.</strong>
        <p>Không gửi cho người khác vì đường dẫn này mở được toàn bộ thông tin phía trên.</p>
      </aside>
    </section>
  );
}
