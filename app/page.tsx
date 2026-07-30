import Link from "next/link";

/**
 * Landing page. Deliberately plain HTML, no Ant Design: it is the first thing a
 * phone on factory wifi loads, and it only has to point at the three zones.
 */
export default function HomePage() {
  return (
    <main className="hub">
      <div className="hub-mark">
        <span>Công ty CTYHP</span>
        <h1>Nghỉ phép &amp; Giấy ra vào cổng</h1>
      </div>

      <div className="hub-zones">
        <Link className="zone" href="/don">
          <b>Gửi đơn</b>
          <code>/don</code>
          <p>
            Xin nghỉ phép hoặc xin ra vào cổng. Chọn tên rồi nhập mã CBNV — không cần đăng nhập,
            không cần mật khẩu.
          </p>
          <span className="lock">Dành cho toàn bộ CBNV</span>
        </Link>

        <Link className="zone" href="/tra-cuu">
          <b>Tra cứu đơn</b>
          <code>/tra-cuu</code>
          <p>
            Xem đơn đã đến đâu, rút đơn còn chờ, nhập giờ vào lại thực tế, in đơn đã duyệt.
          </p>
          <span className="lock">Cần mã đơn kèm mã CBNV</span>
        </Link>

        <Link className="zone" href="/admin">
          <b>Vùng quản trị</b>
          <code>/admin</code>
          <p>Duyệt đơn, chấm công, tạo đơn hộ công nhân, xem tổng quan.</p>
          <span className="lock">Đăng nhập bằng email công ty</span>
        </Link>

        <Link className="zone" href="/bao-ve">
          <b>Bốt bảo vệ</b>
          <code>/bao-ve</code>
          <p>Đơn ra vào cổng đã duyệt trong ngày. Bấm Cho ra / Cho vào để ghi giờ thực tế.</p>
          <span className="lock">Vào bằng mã PIN của bốt</span>
        </Link>
      </div>
    </main>
  );
}
