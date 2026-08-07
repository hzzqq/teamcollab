import { AppShell } from "@/components/shell/app-shell";

/** (app) 路由组：所有需登录的内页共用应用外壳（侧栏 + 顶栏） */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
