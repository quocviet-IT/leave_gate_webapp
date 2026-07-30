"use client";
import { Alert, Card, Space, Tag, Typography } from "antd";

const { Title, Paragraph, Text } = Typography;

export type ScreenSkeletonProps = {
  /** Screen name, matching the PRD so the two can be read side by side. */
  title: string;
  /** Which numbered step of PRD section XV builds this screen. */
  step: number;
  /** PRD section that specifies it, e.g. "VIII". */
  prdSection: string;
  /** What the finished screen contains. */
  contains: string[];
  /** Anything that blocks the step, in the user's words. */
  blockedBy?: string;
};

/**
 * A route that exists but is not built yet.
 *
 * The scaffold ships every route the PRD names so navigation, layout nesting and
 * the auth boundaries are real from day one. Each unbuilt screen says plainly
 * what it will hold and which build step covers it, rather than showing a blank
 * page or fake data that could be mistaken for working software.
 */
export default function ScreenSkeleton({
  title,
  step,
  prdSection,
  contains,
  blockedBy,
}: ScreenSkeletonProps) {
  return (
    <Space direction="vertical" size="middle" style={{ display: "flex" }}>
      <div>
        <Space size="small" wrap>
          <Tag color="default">Bước {step}</Tag>
          <Tag color="blue">PRD mục {prdSection}</Tag>
          <Tag>Chưa xây</Tag>
        </Space>
        <Title level={3} style={{ marginTop: 12, marginBottom: 0 }}>
          {title}
        </Title>
      </div>

      <Card size="small" title="Màn hình này sẽ có">
        <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
          {contains.map((item) => (
            <li key={item}>
              <Text>{item}</Text>
            </li>
          ))}
        </ul>
      </Card>

      {blockedBy ? (
        <Alert type="warning" showIcon message="Đang chờ" description={blockedBy} />
      ) : null}

      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Đường dẫn, tầng bố cục và ranh giới quyền của màn hình này đã dựng thật. Phần còn lại là dữ
        liệu và thao tác, làm theo thứ tự ở mục XV của PRD.
      </Paragraph>
    </Space>
  );
}
