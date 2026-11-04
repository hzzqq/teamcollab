import Link from "next/link";
import { Button } from "@/components/ui/button";

/** 404 页面：未匹配到路由时的兜底（此前无此文件，点击死链只会白屏） */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-warm text-lg font-medium text-muted">
        404
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-fg">页面不存在</h2>
        <p className="max-w-md text-sm text-muted">
          你访问的地址不存在或已被移除。可以返回看板或我的任务继续工作。
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link href="/boards">
          <Button>返回看板</Button>
        </Link>
        <Link href="/me/tasks">
          <Button variant="secondary">我的任务</Button>
        </Link>
      </div>
    </div>
  );
}
