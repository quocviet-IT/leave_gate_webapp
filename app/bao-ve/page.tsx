import ScreenSkeleton from "@/components/ScreenSkeleton";

export const metadata = { title: "Bốt bảo vệ — Nhân sự CTYHP" };

/**
 * The guard booth. Its own zone: no Google account, no Supabase session — a booth
 * PIN and a long-lived session on that one machine (PRD section VIII).
 */
export default function GateBoothPage() {
  return (
    <div
      style={{
        maxWidth: "62rem",
        margin: "0 auto",
        padding: "clamp(1rem, 3vw, 2rem) 1rem 3rem",
      }}
    >
      <ScreenSkeleton
        title="Bốt bảo vệ — đơn ra vào cổng hôm nay"
        step={6}
        prdSection="VIII"
        contains={[
          "Vào bằng mã PIN của bốt, phiên giữ 30 ngày trên máy đó",
          "Chỉ đơn ra vào cổng đã duyệt có giờ ra thuộc hôm nay",
          "Không thấy lý do xin phép, không thấy đơn nghỉ phép",
          "Hai nút mỗi dòng: Cho ra và Cho vào, bấm là ghi giờ đến giây",
          "Phải Cho ra trước mới Cho vào được",
          "Hoàn tác trong 5 phút nếu bấm sai dòng",
          "Ô tìm theo tên và các ô đếm: chưa ra, đang ở ngoài, đã về",
        ]}
        blockedBy="Cần xác nhận bốt bảo vệ có máy nối mạng, và Phòng Nhân sự đặt mã PIN đầu tiên cho bốt."
      />
    </div>
  );
}
