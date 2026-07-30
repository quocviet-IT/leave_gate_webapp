"use client";
import { useActionState } from "react";
import { Alert, Button, Card, Space, Table, Typography } from "antd";
import {
  EMPTY_IMPORT_STATE,
  importEmployeeList,
  type ImportState,
} from "@/app/admin/(guarded)/nhan-su/actions";
import type { EmployeeSummary } from "@/lib/services/employees";

const { Title, Paragraph, Text } = Typography;

const SAMPLE =
  "HP-0148\tNguyễn Văn Bình\tCông nhân\tSản xuất\nHP-0149\tTrần Thị Lan\tCông nhân\tSản xuất";

export default function EmployeeImportPanel({
  employees,
  total,
}: {
  employees: EmployeeSummary[];
  total: number;
}) {
  const [state, submit, pending] = useActionState<ImportState, FormData>(
    importEmployeeList,
    EMPTY_IMPORT_STATE,
  );

  return (
    <Space direction="vertical" size="middle" style={{ display: "flex" }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          Danh sách nhân sự
        </Title>
        <Text type="secondary">
          Dán từ Excel năm cột theo thứ tự: mã CBNV · họ và tên · chức vụ · phòng ban · email. Dòng
          tiêu đề bỏ được. Nhập lại cùng mã là cập nhật, không tạo trùng.
        </Text>
      </div>

      <Card size="small" title="Dán danh sách">
        <form action={submit}>
          <Space direction="vertical" size="small" style={{ display: "flex" }}>
            <textarea
              name="list"
              rows={8}
              defaultValue=""
              placeholder={SAMPLE}
              aria-label="Danh sách nhân sự dán từ Excel"
              style={{
                width: "100%",
                fontFamily: '"Cascadia Mono", Consolas, ui-monospace, monospace',
                fontSize: 13,
                padding: 8,
                border: "1px solid #dbe1ea",
                borderRadius: 6,
                resize: "vertical",
              }}
            />
            <Button type="primary" htmlType="submit" loading={pending}>
              Nhập danh sách
            </Button>
          </Space>
        </form>
      </Card>

      {state.message ? (
        <Alert
          type={state.ok ? "success" : "error"}
          showIcon
          message={state.ok ? "Đã nhập" : "Chưa nhập được"}
          description={state.message}
        />
      ) : null}

      {state.issues.length > 0 ? (
        <Card size="small" title={`${state.issues.length} dòng bị bỏ qua`}>
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {state.issues.map((issue) => (
              <li key={`${issue.line}-${issue.message}`}>
                <Text>
                  Dòng {issue.line}: {issue.message}
                </Text>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card size="small" title={`Đang có ${total} người · hiện ${employees.length} dòng đầu`}>
        <Table<EmployeeSummary>
          size="small"
          rowKey="id"
          dataSource={employees}
          pagination={false}
          scroll={{ x: true }}
          locale={{ emptyText: "Chưa có ai trong danh sách. Dán danh sách ở trên để bắt đầu." }}
          columns={[
            { title: "Mã CBNV", dataIndex: "code", width: 120 },
            { title: "Họ và tên", dataIndex: "full_name" },
            { title: "Chức vụ", dataIndex: "title" },
            { title: "Phòng ban", dataIndex: "department" },
          ]}
        />
      </Card>

      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Mã CBNV chỉ dùng để nhận ra một người là cùng một dòng khi nhập lại danh sách. Form công
        khai không hỏi mã này và không bao giờ hiện nó ra.
      </Paragraph>
    </Space>
  );
}
