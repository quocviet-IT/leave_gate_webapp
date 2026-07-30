import ScreenSkeleton from "@/components/ScreenSkeleton";

export const metadata = { title: "Chấm công — Quản trị CTYHP" };

export default function TimesheetPage() {
  return (
    <ScreenSkeleton
      title="Chấm công — đơn đã duyệt"
      step={7}
      prdSection="X · XI · XII"
      contains={[
        "Lọc theo kỳ, phòng ban, loại đơn",
        "Ô đếm: đã duyệt, chưa chấm, thiếu giờ cổng, giờ nghỉ phép, giờ ra cổng",
        "Cột Giờ cổng — giờ bảo vệ bấm, để đối chiếu với giờ CBNV khai",
        "Cột Giờ tính khóa; cột Giờ chốt sửa được",
        "Ô lý do điều chỉnh bắt buộc từ 10 ký tự khi Giờ chốt khác Giờ tính",
        "Vết sửa: số cũ, số mới, người sửa, thời điểm, lý do",
        "Tải Excel và đánh dấu đã chấm công",
        "Sửa giờ ra vào thực tế đã quá hạn, kèm lý do",
      ]}
    />
  );
}
