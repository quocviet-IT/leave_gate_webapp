import RequestForm, { type RequestKind } from "@/components/public/RequestForm";

export const metadata = { title: "Gửi đơn - Nhân sự CTYHP" };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * One page, one form — the steps are gone. `?kind=gate` opens straight on the
 * gate pass so a QR code at the guard booth can skip the choice; anything else
 * opens on leave, which is the commoner errand.
 */
function kindOf(value: string | string[] | undefined): RequestKind {
  return (Array.isArray(value) ? value[0] : value) === "gate" ? "gate" : "leave";
}

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return <RequestForm initialKind={kindOf(params.kind)} />;
}
