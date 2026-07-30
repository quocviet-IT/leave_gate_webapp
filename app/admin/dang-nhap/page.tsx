import SignInCard from "@/components/admin/SignInCard";
import { ALLOWED_DOMAIN } from "@/lib/auth";

export const metadata = { title: "Đăng nhập — Quản trị CTYHP" };

export default function AdminSignInPage() {
  return <SignInCard domain={ALLOWED_DOMAIN} />;
}
