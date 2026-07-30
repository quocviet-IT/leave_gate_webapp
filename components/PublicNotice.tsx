/**
 * The public-zone counterpart of `ScreenSkeleton`: a route that exists but is not
 * built yet.
 *
 * Deliberately plain markup with no Ant Design and no client JavaScript at all.
 * The public zone has a 60 KB first-load budget because it opens on a worker's
 * phone, and a placeholder must not be the thing that breaks it.
 */
export type PublicNoticeProps = {
  title: string;
  /** Which numbered step of PRD section XV builds this screen. */
  step: number;
  /** PRD section that specifies it, e.g. "X · XII". */
  prdSection: string;
  contains: string[];
  blockedBy?: string;
};

export default function PublicNotice({
  title,
  step,
  prdSection,
  contains,
  blockedBy,
}: PublicNoticeProps) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem" }}>
        <span className="tagline">Bước {step}</span>
        <span className="tagline tagline--accent">PRD mục {prdSection}</span>
        <span className="tagline">Chưa xây</span>
      </div>

      <h1 style={{ margin: 0, fontSize: "1.25rem", lineHeight: 1.2 }}>{title}</h1>

      <div>
        <h2 className="notice-h">Màn hình này sẽ có</h2>
        <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "#45516a", fontSize: ".875rem" }}>
          {contains.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      {blockedBy ? (
        <p className="notice-warn">
          <strong>Đang chờ: </strong>
          {blockedBy}
        </p>
      ) : null}

      <p style={{ margin: 0, color: "#79849b", fontSize: ".8125rem" }}>
        Đường dẫn và bố cục của màn hình này đã dựng thật. Phần còn lại là dữ liệu và thao tác, làm
        theo thứ tự ở mục XV của PRD.
      </p>
    </section>
  );
}
