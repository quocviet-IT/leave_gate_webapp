import { notFound } from "next/navigation";
import { isLookupToken } from "@/lib/domain/codes";
import PublicNotice from "@/components/PublicNotice";

export const metadata = { title: "Đơn của tôi — Nhân sự CTYHP" };

/**
 * The private link handed to the employee when they file. The token is checked
 * for shape here; whether it matches a real request is a database question,
 * answered in build step 4.
 */
export default async function LookupByTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isLookupToken(token)) notFound();

  return (
    <PublicNotice
      title="Đơn của tôi — mở bằng link riêng"
      step={4}
      prdSection="XII · XIII"
      contains={[
        "Mở trực tiếp đơn mà link này trỏ tới, không cần nhập mã đơn",
        "Vẫn hỏi mã CBNV trước khi cho rút đơn hoặc sửa giờ thực tế",
        "Cùng các thao tác của trang tra cứu",
      ]}
    />
  );
}
