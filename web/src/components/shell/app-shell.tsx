"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { TabBar } from "./tab-bar";
import { useNotificationStream } from "@/hooks/use-notifications";
import { useMe } from "@/hooks/use-me";
import { CommandPalette } from "@/components/command/command-palette";
import { ShortcutHelp } from "@/components/command/shortcut-help";
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts";
import type { ShortcutAction } from "@/lib/shortcuts";

/** 应用外壳（DESIGN.md 页面 6）：Sidebar 240px 可折叠 + 顶部栏 + 移动 TabBar */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { connected } = useNotificationStream();
  useMe(); // 预取 /me（401 时由 api 层跳登录）

  const onShortcut = useCallback(
    (action: ShortcutAction) => {
      if (action === "palette") setPaletteOpen((v) => !v);
      else if (action === "help") setHelpOpen(true);
      else if (action === "quick-add" && !/^\/boards\/[^/]+/.test(pathname)) {
        // 不在看板页时没有列可承载新建任务：引导到看板列表并说明用法
        router.push("/boards");
        toast.info("进入看板后按 C 可快速新建任务");
      }
    },
    [pathname, router],
  );

  useGlobalShortcuts({ overlayOpen: paletteOpen || helpOpen, onAction: onShortcut });

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onOpenSearch={() => setPaletteOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
        />
        {/* SSE 断开提示条（页面 2 Error 态） */}
        {!connected ? (
          <div className="flex items-center gap-1.5 border-b border-warn/30 bg-warn/10 px-4 py-1 text-xs text-warn">
            <WifiOff size={14} strokeWidth={1.5} />
            实时连接已断开，正在重连
          </div>
        ) : (
          <div className="flex items-center gap-1.5 border-b border-border-soft px-4 py-1 text-xs text-meta">
            <Wifi size={14} strokeWidth={1.5} />
            实时连接正常
          </div>
        )}
        <main className="min-w-0 flex-1 overflow-auto pb-14 md:pb-0">{children}</main>
      </div>
      <TabBar />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
