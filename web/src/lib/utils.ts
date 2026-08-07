import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn 类名合并工具 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 首字母大写（头像 fallback 用） */
export function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

/** 截断字符串（标题/描述） */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
