import { headers } from "next/headers";
import { absolutePublicUrl } from "@/lib/public-url";
import { qrSvg } from "@/lib/qr";

export const metadata = { title: "Đã gửi đơn - Nhân sự CTYHP" };

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function FiledRequestPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const code = one(params.code).trim().toUpperCase();
  const token = one(params.token).trim().toLowerCase();
  const validCode = /^(NP|RC)-\d{4}-\d{4}$/.test(code);
  const validToken = /^[0-9a-f]{32}$/.test(token);

  if (!validCode || !validToken) {
    return (
      <section className="success-page">
        <span className="step-kicker">Đường dẫn chưa đầy đủ</span>
        <h1>Không mở được kết quả gửi đơn</h1>
        <p>
          Trang này cần mã đơn và đường dẫn riêng được cấp ngay sau khi gửi. Hãy quay lại form và
          gửi lại nếu bạn chưa nhận được hai thông tin đó.
        </p>
        <a className="button button--primary" href="/don">
          Mở form gửi đơn
        </a>
      </section>
    );
  }

  const requestHeaders = await headers();
  const lookupPath = `/tra-cuu/${token}`;
  const lookupUrl = absolutePublicUrl(requestHeaders, lookupPath);
  const svg = await qrSvg(lookupUrl);

  return (
    <section className="success-page">
      <span className="step-kicker">Đã gửi đơn</span>
      <h1>Hệ thống đã nhận đơn của bạn</h1>

      <div className="success-code-card">
        <span>Mã đơn</span>
        <strong>{code}</strong>
        <small>Chụp lại màn hình này</small>
      </div>

      <div className="success-qr">
        <div
          className="success-qr-image"
          aria-label="Mã QR mở đường dẫn theo dõi riêng"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div>
          <h2>Đường dẫn theo dõi riêng</h2>
          <p>
            Quét mã QR để mở lại đơn trên điện thoại khác, hoặc bấm nút bên dưới trên thiết bị này.
          </p>
          <a className="button button--primary" href={lookupPath}>
            Mở trang theo dõi
          </a>
        </div>
      </div>

      <aside className="private-link-note">
        <strong>Giữ riêng đường dẫn này.</strong>
        <p>
          Đây là cách duy nhất để xem đầy đủ, rút đơn hoặc bổ sung giờ vào lại thực tế. Mã đơn một
          mình chỉ cho biết trạng thái chung.
        </p>
      </aside>
    </section>
  );
}
