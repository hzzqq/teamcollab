import { SkeletonRows } from "@/components/common/states";

/** 内页加载态（App Router）：避免数据拉取期间出现空白闪烁 */
export default function AppLoading() {
  return (
    <div className="page-container">
      <SkeletonRows rows={3} />
    </div>
  );
}
