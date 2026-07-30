"use client";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App, ConfigProvider, theme as antdTheme } from "antd";
import viVN from "antd/locale/vi_VN";

const SANS = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

/**
 * Ant Design context for the zones that are allowed to load it: the admin zone
 * and the gate booth. Not used by the public zone — see `app/layout.tsx`.
 *
 * Vietnamese locale, and the navy the PRD uses, so the running app and the
 * document people signed off read as the same product. A native font stack means
 * zero web-font requests.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider
        locale={viVN}
        theme={{
          algorithm: antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: "#2a4b9b",
            colorInfo: "#2a4b9b",
            colorSuccess: "#2c6d51",
            colorWarning: "#8d6220",
            colorError: "#9e3128",
            colorBgLayout: "#eef1f6",
            colorTextHeading: "#17202e",
            borderRadius: 6,
            fontFamily: SANS,
            fontSize: 14,
            wireframe: false,
          },
          components: {
            Layout: {
              siderBg: "#17202e",
              triggerBg: "#101725",
              headerBg: "#ffffff",
              headerHeight: 56,
            },
            Menu: {
              darkItemBg: "#17202e",
              darkSubMenuItemBg: "#17202e",
              darkItemSelectedBg: "#2a4b9b",
              darkItemColor: "#c3cbdb",
              darkItemHoverBg: "#232e42",
            },
            Table: {
              headerBg: "#f7f9fc",
              headerColor: "#45516a",
              borderColor: "#eaeef4",
            },
          },
        }}
      >
        <App>{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
