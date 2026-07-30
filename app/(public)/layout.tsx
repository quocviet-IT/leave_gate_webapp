import Link from "next/link";

/**
 * Shell for the zone with no login: the request form and the lookup page.
 * Plain markup on purpose — this layout is on the critical path for a phone at
 * the workshop noticeboard.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: "44rem",
        margin: "0 auto",
        padding: "clamp(1rem, 4vw, 2.5rem) 1rem 3rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: ".2rem" }}>
        <Link
          href="/"
          style={{
            fontSize: ".72rem",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "#79849b",
            textDecoration: "none",
          }}
        >
          Nhân sự CTYHP
        </Link>
        <strong style={{ fontSize: "1.05rem" }}>Nghỉ phép &amp; ra vào cổng</strong>
      </header>
      <main
        style={{
          background: "#fff",
          border: "1px solid #dbe1ea",
          borderTop: "3px solid #2a4b9b",
          padding: "clamp(1rem, 3vw, 1.5rem)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
