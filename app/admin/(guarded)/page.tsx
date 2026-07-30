import ScreenSkeleton from "@/components/ScreenSkeleton";

export default function AdminOverviewPage() {
  return (
    <ScreenSkeleton
      title="Tổng quan"
      step={8}
      prdSection="III · XII"
      contains={[
        "Ô đếm: chờ duyệt, quá 2 giờ chưa ai nhận, đơn tôi đang giữ",
        "Ô đếm: ra cổng hôm nay, chưa chấm công, giờ nghỉ trong kỳ",
        "Cảnh báo khi có đơn quá mốc 2 giờ, kèm giờ đã nhắc nhóm Chat",
        "Bảng đơn cần chú ý: mã đơn, người gửi, loại, đã chờ bao lâu, tình trạng",
      ]}
    />
  );
}
