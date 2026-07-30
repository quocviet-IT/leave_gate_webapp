import ScreenSkeleton from "@/components/ScreenSkeleton";

export const metadata = { title: "Gửi đơn — Nhân sự CTYHP" };

export default function NewRequestPage() {
  return (
    <ScreenSkeleton
      title="Gửi đơn — form công khai"
      step={3}
      prdSection="X · XII"
      contains={[
        "Ô Loại đơn: Xin nghỉ phép hoặc Ra vào cổng, đổi các trường bên dưới",
        "Tìm và chọn tên trong danh sách CBNV đồng bộ từ Google Directory",
        "Ô mã CBNV, phải khớp với tên đã chọn mới gửi được",
        "Chức vụ và phòng ban tự hiện ra, chỉ đọc",
        "Nghỉ phép: khoảng ngày, nửa ngày, 8 lý do, diễn giải, bàn giao, ngày làm bù, cam kết",
        "Ra vào cổng: lý do, diễn giải, giờ ra, giờ vào lại dự kiến",
        "Dòng tự tính số giờ ngay khi chọn ngày hoặc giờ",
        "Gửi xong hiện mã đơn và link theo dõi riêng",
      ]}
      blockedBy="Chưa có nguồn mã CBNV. Google Directory không chứa trường này, nên chưa đối chiếu được tên với mã — Phòng Nhân sự cần nạp mã vào Directory hoặc gửi file mã ↔ họ tên."
    />
  );
}
