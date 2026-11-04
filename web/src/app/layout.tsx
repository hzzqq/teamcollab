import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "TeamCollab · 任务协作",
  description: "给中型团队的刚刚好任务协作工具",
};

/**
 * 首屏主题脚本：在 React hydration 之前同步应用 localStorage 中的主题，
 * 避免深色用户看到一闪而过的白屏（FOUC）。
 * 必须在 <head> 内同步执行 —— 放到 body 里会晚于首次绘制。
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='dark'&&t!=='light'){t='light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
