import ScreenSkeleton from "@/components/ScreenSkeleton";

export const metadata = { title: "Duyệt đơn — Quản trị CTYHP" };

export default function ApprovalQueuePage() {
  return (
    <ScreenSkeleton
      title="Hàng chờ duyệt"
      step={5}
      prdSection="VII · XII"
      contains={[
        "Bốn tab: Tất cả đơn chờ · Tôi đã nhận · Tôi đã duyệt · Quá hạn",
        "Nút Nhận xử lý trên mỗi dòng; nhận rồi tự nhả sau 30 phút",
        "Nút Duyệt và Từ chối chỉ hiện sau khi đã nhận xử lý",
        "Dòng người khác đang giữ bị xám lại kèm tên người giữ",
        "Đơn của chính mình bị ẩn nút Duyệt",
        "Chặn thao tác trên dữ liệu cũ, báo rõ ai vừa duyệt và lúc nào",
        "Bảng tự cập nhật khi máy khác đổi trạng thái đơn",
        "Cột Chờ tô đỏ khi quá mốc 2 giờ làm việc",
      ]}
    />
  );
}
