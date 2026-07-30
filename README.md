# Hệ thống Xin nghỉ phép & Giấy ra vào cổng

Web app nội bộ CTYHP thay hai mẫu đơn giấy đang lưu hành. CBNV mở link hoặc quét mã QR để gửi
đơn — không cần đăng nhập; một trong bốn chị nhận và duyệt; bảo vệ xác nhận giờ ra vào ngay tại
bốt; đơn đã duyệt chảy về màn hình chấm công.

**Trạng thái:** PRD v0.5 (nháp) + khung web app đã dựng và chạy được. Nền cơ sở dữ liệu đã áp
lên Supabase; logic tính giờ / SLA / mã đơn đã có kèm test. Các màn hình còn là chỗ trống có
nhãn — xem [AGENTS.md](AGENTS.md) để biết bước kế tiếp.

```bash
npm install
cp .env.local.example .env.local   # điền URL + key của Supabase
npm run migrate                    # áp migration
npm run dev
```

Bốn cổng kiểm tra: `npm run build` · `npm test` · `npm run typecheck` · `npm run lint`, cộng
`node scripts/smoke-pages.mjs http://localhost:3000` khi sửa giao diện.

Hệ thống chia **ba vùng**: vùng nhân viên công khai (`/don`, `/tra-cuu` — không đăng nhập, nhận
diện bằng tên + mã CBNV), vùng quản trị (`/admin` — Google SSO `@ctyhp.vn`), và vùng bốt bảo vệ
(`/bao-ve` — mã PIN của bốt).

## Tài liệu

| File | Nội dung |
| --- | --- |
| [docs/PRD_Nghi_Phep_Ra_Vao_Cong.html](docs/PRD_Nghi_Phep_Ra_Vao_Cong.html) | PRD v0.5: bảng đối chiếu 17 góp ý của BGĐ, ba vùng, vai trò, 9 màn hình, 20 quy tắc nghiệp vụ, đồng bộ Directory, thứ tự làm, rủi ro |
| [docs/DEMO_Nghi_Phep_Ra_Vao_Cong.html](docs/DEMO_Nghi_Phep_Ra_Vao_Cong.html) | Demo giao diện tương tác — **còn theo v0.4**, chưa cập nhật ba vùng và màn hình bảo vệ |

Mở trực tiếp bằng trình duyệt, không cần build.

## Phạm vi Phase 1

Form công khai một route với trường động · nhận diện bằng tên + mã CBNV · mã QR dán xưởng · trang
tra cứu (theo dõi, rút đơn, nhập giờ thực tế, in) · hàng chờ duyệt có nút Nhận xử lý và khóa chống
duyệt trùng · bốn tab cá nhân · quản xưởng tạo đơn hộ · màn hình bốt bảo vệ với nút Cho ra/Cho vào ·
hai nhóm Google Chat · nhắc SLA 1h/2h · tự tính số giờ · chấm công (lọc, Excel, lý do điều chỉnh bắt
buộc) · đồng bộ Google Workspace Directory · bản in theo mẫu giấy · dùng được trên điện thoại.

Để lại Phase 2: tự trừ ngày lễ, số ngày phép năm còn lại, nối máy chấm công/bảng lương, nhắn riêng
Google Chat, quét QR từng đơn tại cổng, đăng nhập đích danh cho bảo vệ, màn hình quản trị phòng
ban/CBNV, phân quyền duyệt theo phòng ban.

## Kỹ thuật dự kiến

Next.js 16 · React 19 · Ant Design 6 · Supabase (Postgres, phân quyền ở tầng dữ liệu cho cả ba
vùng) · Google Workspace SSO giới hạn tên miền `ctyhp.vn` cho vùng quản trị · mã PIN cho bốt bảo
vệ · Google Chat webhook (2 nhóm) · Vercel.

## Quan hệ với app kế toán

Đây là **hệ thống riêng**, tách hoàn toàn khỏi app kế toán CTYHP (`QUICKBOOK_WEBAPP`): repo riêng,
cơ sở dữ liệu riêng, tài khoản riêng. CBNV vào app này không chạm được dữ liệu kế toán.

## Còn thiếu để bắt đầu

1. **Nguồn mã CBNV** — Google Directory không có trường này, mà mã CBNV là thứ thay mật khẩu ở form
   công khai. Thiếu nó thì bước 3 của thứ tự làm không chạy được.
2. Danh sách phòng / ban / bộ phận chính thức.
3. Danh sách quản xưởng được phép tạo đơn hộ.
4. Mã PIN cho bốt và xác nhận bốt bảo vệ có máy nối mạng.
