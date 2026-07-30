import ScreenSkeleton from "@/components/ScreenSkeleton";

export const metadata = { title: "Tạo đơn hộ — Quản trị CTYHP" };

export default function FileOnBehalfPage() {
  return (
    <ScreenSkeleton
      title="Tạo đơn hộ công nhân"
      step={8}
      prdSection="V · XIII"
      contains={[
        "Chỉ chọn được người thuộc bộ phận của mình",
        "Cùng hai biểu mẫu như form công khai",
        "Đơn ghi rõ do ai tạo hộ, in ra bản giấy cũng thấy",
        "Không có quyền duyệt — đơn vẫn vào hàng chờ của bốn chị",
        "Xem trạng thái các đơn mình đã tạo hộ",
      ]}
    />
  );
}
