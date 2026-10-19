import { headers } from "next/headers";
import PrintButton from "@/components/admin/PrintButton";
import { requireRole } from "@/lib/auth";
import { absolutePublicUrl } from "@/lib/public-url";
import { qrSvg } from "@/lib/qr";

export const metadata = { title: "Poster QR - Quản trị CTYHP" };

export default async function PosterPage() {
  await requireRole("cnb");
  const requestHeaders = await headers();
  const formUrl = absolutePublicUrl(requestHeaders, "/don");
  const svg = await qrSvg(formUrl);

  return (
    <div className="poster-screen">
      <div className="poster-toolbar">
        <div>
          <h1>Poster QR cho xưởng</h1>
          <p>Khổ A4 dọc. Khi in, chọn tỷ lệ 100% và tắt đầu trang, chân trang của trình duyệt.</p>
        </div>
        <PrintButton />
      </div>

      <article className="qr-poster">
        <header>
          <span>Công ty CTYHP</span>
          <h1>Gửi đơn nghỉ phép và giấy ra vào cổng</h1>
          <p>Quét mã bằng camera điện thoại để mở form.</p>
        </header>

        <div
          className="poster-qr"
          aria-label="Mã QR mở form gửi đơn CTYHP"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <p className="poster-url">{formUrl}</p>

        <ol className="poster-steps">
          <li>
            <strong>Quét mã</strong>
            <span>Mở camera điện thoại và hướng vào mã QR.</span>
          </li>
          <li>
            <strong>Chọn tên</strong>
            <span>Gõ ít nhất hai ký tự rồi chọn đúng tên của bạn.</span>
          </li>
          <li>
            <strong>Điền thông tin</strong>
            <span>Chọn loại đơn, thời gian và ghi rõ nội dung.</span>
          </li>
          <li>
            <strong>Chụp lại mã đơn</strong>
            <span>Lưu mã đơn và đường dẫn riêng để theo dõi.</span>
          </li>
        </ol>

        <footer>
          <strong>Không cần đăng nhập. Không cần mật khẩu.</strong>
          <span>Nếu không tìm thấy tên, liên hệ Phòng Nhân sự để kiểm tra danh sách.</span>
        </footer>
      </article>
    </div>
  );
}
