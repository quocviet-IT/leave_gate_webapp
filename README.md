# Hệ thống Xin nghỉ phép & Giấy ra vào cổng

Web app nội bộ CTYHP thay hai mẫu đơn giấy đang lưu hành. CBNV gửi đơn trên điện thoại, một
trong bốn chị duyệt, Google Chat thông báo ngay, đơn đã duyệt chảy về màn hình chấm công.

**Trạng thái:** mới ở mức tài liệu. PRD v0.4 (nháp) + demo giao diện. Chưa có code.

## Tài liệu

| File | Nội dung |
| --- | --- |
| [docs/PRD_Nghi_Phep_Ra_Vao_Cong.html](docs/PRD_Nghi_Phep_Ra_Vao_Cong.html) | PRD đầy đủ: vấn đề, mục tiêu, phạm vi, vai trò, 6 màn hình, 10 quy tắc nghiệp vụ, thứ tự làm, rủi ro |
| [docs/DEMO_Nghi_Phep_Ra_Vao_Cong.html](docs/DEMO_Nghi_Phep_Ra_Vao_Cong.html) | Demo giao diện tương tác |

Mở trực tiếp bằng trình duyệt, không cần build.

## Phạm vi Phase 1

Đăng nhập một nút bằng email `@ctyhp.vn` · đơn xin nghỉ phép · giấy ra vào cổng · trang "Đơn của
tôi" · hàng chờ duyệt chung cho bốn người duyệt · tự tính số giờ · màn hình chấm công (lọc, Excel,
đánh dấu) · thông báo Google Chat · bản in theo bố cục mẫu giấy · dùng được trên điện thoại.

Để lại Phase 2: màn hình cho bảo vệ tại cổng, tự trừ ngày lễ, số ngày phép năm còn lại, nối máy
chấm công/bảng lương, nhắn riêng Google Chat, màn hình quản trị phòng ban/CBNV.

## Kỹ thuật dự kiến

Next.js 16 · React 19 · Ant Design 6 · Supabase (Postgres, phân quyền ở tầng dữ liệu) · Google
Workspace SSO giới hạn tên miền `ctyhp.vn` · Google Chat webhook · Vercel.

## Quan hệ với app kế toán

Đây là **hệ thống riêng**, tách hoàn toàn khỏi app kế toán CTYHP (`QUICKBOOK_WEBAPP`): repo riêng,
cơ sở dữ liệu riêng, tài khoản riêng. CBNV vào app này không chạm được dữ liệu kế toán.

## Còn thiếu để bắt đầu

Danh sách phòng / ban / bộ phận chính thức. Trong lúc chờ dùng danh sách tạm.
