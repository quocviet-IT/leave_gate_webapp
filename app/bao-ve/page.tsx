import BoothBoard from "@/components/booth/BoothBoard";
import BoothPinForm from "@/components/booth/BoothPinForm";
import { boothToday } from "@/lib/services/booth";
import { serverNow } from "@/lib/server-time";

export const metadata = { title: "Bốt bảo vệ — Nhân sự CTYHP" };

/** The booth reads a cookie, so it can never be prerendered. */
export const dynamic = "force-dynamic";

/**
 * The guard booth. Its own zone: no Google account, no Supabase session — a
 * booth PIN and a long-lived session on that one machine (PRD section VIII).
 */
export default async function GateBoothPage() {
  let board: Awaited<ReturnType<typeof boothToday>> = null;
  try {
    board = await boothToday();
  } catch {
    // An expired session raises rather than returning nothing. Either way the
    // guard's next step is the same: enter the PIN again.
    board = null;
  }

  return (
    <div
      style={{
        maxWidth: "62rem",
        margin: "0 auto",
        padding: "clamp(1rem, 3vw, 2rem) 1rem 3rem",
      }}
    >
      {board ? (
        <BoothBoard
          boothName={board.booth.name}
          rows={board.rows}
          serverNow={serverNow().toISOString()}
        />
      ) : (
        <BoothPinForm />
      )}
    </div>
  );
}
