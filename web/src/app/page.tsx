import { redirect } from "next/navigation";

/** 根路径：登录用户进「我的任务」，未登录进登录页（token 决定） */
export default function HomePage() {
  redirect("/me/tasks");
}
