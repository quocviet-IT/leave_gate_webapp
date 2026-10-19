import { statusLookupSchema } from "@/lib/domain/schemas";
import { STATUS_LABELS } from "@/lib/format";
import { statusByCode } from "@/lib/services/requests";

export const metadata = { title: "Tra cứu đơn - Nhân sự CTYHP" };

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function LookupPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const requestCode = one(params.ma).trim().toUpperCase();
  const parsed = requestCode ? statusLookupSchema.safeParse({ requestCode }) : null;
  const status = parsed?.success ? await statusByCode(parsed.data.requestCode) : null;
  const statusLabel =
    status && status in STATUS_LABELS
      ? STATUS_LABELS[status as keyof typeof STATUS_LABELS]
      : null;

  return (
    <section className="status-lookup">
      <header>
        <span className="step-kicker">Tra cứu bằng mã đơn</span>
        <h1>Xem trạng thái chung</h1>
        <p>
          Mã đơn chỉ cho biết trạng thái. Muốn xem tên, thời gian, lý do hoặc rút đơn, bạn cần mở
          đường dẫn theo dõi riêng đã nhận khi gửi.
        </p>
      </header>

      <form action="/tra-cuu" method="get" className="request-form">
        <div className="form-field">
          <label htmlFor="requestCode">Mã đơn</label>
          <input
            id="requestCode"
            className="field-control request-code-input"
            name="ma"
            type="text"
            defaultValue={requestCode}
            placeholder="NP-2607-0148"
            autoComplete="off"
          />
          <span className="field-help">Mã bắt đầu bằng NP hoặc RC.</span>
          {parsed && !parsed.success ? (
            <p className="field-error">{parsed.error.issues[0]?.message}</p>
          ) : null}
        </div>
        <div className="form-actions form-actions--end">
          <button className="button button--primary" type="submit">
            Xem trạng thái
          </button>
        </div>
      </form>

      {parsed?.success ? (
        statusLabel ? (
          <div className="status-result" aria-live="polite">
            <span>Mã đơn {parsed.data.requestCode}</span>
            <strong className={`request-status request-status--${status}`}>{statusLabel}</strong>
            <p>Không hiển thị thông tin cá nhân trên đường tra cứu bằng mã đơn.</p>
          </div>
        ) : (
          <div className="form-alert" role="status">
            Không tìm thấy mã đơn này. Kiểm tra lại từng ký tự.
          </div>
        )
      ) : null}

      <aside className="private-link-note">
        <strong>Bạn có mã QR hoặc đường dẫn riêng?</strong>
        <p>Hãy mở trực tiếp đường dẫn đó để xem đầy đủ và thao tác trên đơn.</p>
      </aside>
    </section>
  );
}
