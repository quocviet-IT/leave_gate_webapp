import Link from "next/link";
import PrintableRequest from "@/components/public/PrintableRequest";
import { lookupRequest } from "@/lib/services/requests";

export const metadata = { title: "In đơn - Nhân sự CTYHP" };

/**
 * The printable sheet — PRD section IX and build step 10.
 *
 * Behind the private token like everything else that shows a name: a printed
 * page carries more than the request code ever may. Only an approved request
 * prints, because a sheet with an empty approval box is what the app exists to
 * stop being handed around.
 */
export default async function PrintRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;
  const token = rawToken.trim().toLowerCase();
  const request = /^[0-9a-f]{32}$/.test(token) ? await lookupRequest(token) : null;

  if (!request) {
    return (
      <section className="status-lookup">
        <h1>Không tìm thấy đơn</h1>
        <p>Kiểm tra lại đường dẫn theo dõi đã lưu.</p>
        <Link className="button button--primary" href="/tra-cuu">
          Tra cứu bằng mã đơn
        </Link>
      </section>
    );
  }

  if (request.status !== "approved") {
    return (
      <section className="status-lookup">
        <h1>Chưa in được</h1>
        <p>Chỉ in đơn đã duyệt. Đơn này đang ở trạng thái khác.</p>
        <Link className="button button--primary" href={`/tra-cuu/${token}`}>
          Quay lại theo dõi đơn
        </Link>
      </section>
    );
  }

  return (
    <>
      <div className="print-actions">
        <Link className="button button--secondary" href={`/tra-cuu/${token}`}>
          Quay lại
        </Link>
        <span className="field-help">
          Bấm Ctrl+P (hoặc Cmd+P) để in. Khổ A4, không cần chỉnh gì thêm.
        </span>
      </div>
      <PrintableRequest request={request} />
    </>
  );
}
