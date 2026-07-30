import Providers from "@/app/providers";

/**
 * The admin zone loads Ant Design; the public zone does not. This layout is that
 * boundary. It wraps the sign-in and no-access pages too, which need the theme
 * but must stay outside the role guard in `(guarded)/layout.tsx`.
 */
export default function AdminZoneLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
