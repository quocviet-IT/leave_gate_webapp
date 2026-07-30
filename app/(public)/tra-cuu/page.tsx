import ScreenSkeleton from "@/components/ScreenSkeleton";

export const metadata = { title: "Tra cứu đơn — Nhân sự CTYHP" };

export default function LookupPage() {
  return (
    <ScreenSkeleton
      title="Tra cứu đơn"
      step={4}
      prdSection="XII · XIII"
      contains={[
        "Nhập mã đơn kèm mã CBNV để mở đơn của mình",
        "Trạng thái đơn: chờ duyệt, đang xử lý, đã duyệt, bị từ chối, đã rút",
        "Ai duyệt và lúc nào; lý do từ chối nếu có",
        "Rút đơn còn chờ, kể cả khi đã có người nhận xử lý",
        "Nhập giờ vào lại thực tế khi bảo vệ không bấm, hạn hết ngày làm việc kế tiếp",
        "Bắt buộc ghi lý do khi lệch quá 15 phút",
        "In đơn đã duyệt theo bố cục mẫu giấy",
      ]}
    />
  );
}
