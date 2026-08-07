"use client";

import type { ReactNode } from "react";

/** 与后端 _MENTION_RE 一致的提及正则（@ 后跟单个词，支持中文/字母/数字/点/加号/连字符） */
const MENTION_RE = /@[\w\u4e00-\u9fff][\w\u4e00-\u9fff.+-]*/g;

/**
 * 评论内容里的 @提及 高亮渲染。
 * - 命中的成员名（knownNames 里有）→ 高亮 chip
 * - 未命中的 @token → 主色文字（视觉统一）
 * 纯文本分段渲染，不注入 HTML（无 XSS 风险）。
 */
export function HighlightMentions({
  content,
  knownNames,
}: {
  content: string;
  knownNames?: Set<string>;
}) {
  const tokens = content.match(MENTION_RE) ?? [];
  if (tokens.length === 0) {
    return <>{content}</>;
  }
  const parts = content.split(MENTION_RE);
  const nodes: ReactNode[] = [];
  tokens.forEach((tok, i) => {
    nodes.push(<span key={`t${i}`}>{parts[i]}</span>);
    const name = tok.slice(1);
    const known = knownNames?.has(name) ?? false;
    nodes.push(
      <span
        key={`m${i}`}
        className={
          known
            ? "rounded bg-primary-50 px-1 font-medium text-primary-600 dark:bg-surface-warm"
            : "font-medium text-primary-600"
        }
      >
        {tok}
      </span>
    );
  });
  nodes.push(<span key="tail">{parts[parts.length - 1]}</span>);
  return <>{nodes}</>;
}
