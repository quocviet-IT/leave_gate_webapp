import Providers from "@/app/providers";

/**
 * The booth runs on a shared machine at the gate, not a worker's phone, so it may
 * load Ant Design — the table and the two large buttons are worth the weight.
 */
export default function GateZoneLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
