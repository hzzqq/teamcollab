"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
import type { Member } from "@/lib/api-types";

/**
 * 评论输入框 + @提及 成员快捷选择。
 * - 输入 @ 且光标后是词首 → 弹出成员下拉（按 display_name 过滤）
 * - 点击 / Enter 选中 → 插入 "@显示名 " 到光标处
 * - 与后端 _MENTION_RE 兼容：@ 后接 [\w\u4e00-\u9fff.+-]* 视为正在输入的 token
 */
export function CommentComposer({
  members,
  onSend,
  pending,
  placeholder = "写评论，用 @ 提及同事",
}: {
  members?: Member[];
  onSend: (content: string) => Promise<void>;
  pending: boolean;
  placeholder?: string;
}) {
  const [comment, setComment] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  /** 从文本与光标位置提取当前 @token（位于词首的 @xxx） */
  function extractMention(value: string, caret: number): string | null {
    const before = value.slice(0, caret);
    const atIdx = before.lastIndexOf("@");
    if (atIdx === -1) return null;
    const token = before.slice(atIdx + 1);
    // @ 前面必须是空白或开头（避免 email 等中间 @）
    if (atIdx > 0 && !/[\s(（]/.test(before[atIdx - 1])) return null;
    if (/[\s@]/.test(token)) return null; // token 含空格 → 已完成
    return token;
  }

  const candidates = mentionQuery === null
    ? []
    : (members ?? []).filter((m) =>
        m.user.display_name.toLowerCase().includes(mentionQuery.toLowerCase())
      );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    const caret = e.target.selectionStart ?? value.length;
    setComment(value);
    const q = extractMention(value, caret);
    setMentionQuery(q);
    setSelectedIndex(0);
  }

  function insertMention(name: string) {
    if (mentionQuery === null || !inputRef.current) return;
    const value = comment;
    const caret = inputRef.current.selectionStart ?? value.length;
    const atIdx = value.slice(0, caret).lastIndexOf("@");
    const next = value.slice(0, atIdx) + `@${name} ` + value.slice(caret);
    setComment(next);
    setMentionQuery(null);
    // 聚焦并把光标移到插入内容后
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const pos = atIdx + name.length + 2;
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (mentionQuery !== null && candidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % candidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(candidates[selectedIndex].user.display_name);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleSend() {
    const content = comment.trim();
    if (!content || pending) return;
    await onSend(content);
    setComment("");
    setMentionQuery(null);
  }

  // 点击外部关闭下拉
  useEffect(() => {
    if (mentionQuery === null) return;
    function onDocClick(e: MouseEvent) {
      const el = e.target as HTMLElement;
      if (!el.closest("[data-mention-popover]") && !el.closest("[data-comment-input]")) {
        setMentionQuery(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [mentionQuery]);

  return (
    <div className="relative">
      <div data-comment-input className="flex gap-2">
        <Input
          ref={inputRef}
          value={comment}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={pending}
        />
        <Button onClick={handleSend} disabled={pending || !comment.trim()}>
          {pending ? "发送中" : "发送"}
        </Button>
      </div>

      {mentionQuery !== null && candidates.length > 0 ? (
        <div
          data-mention-popover
          role="listbox"
          aria-label="选择要提及的成员"
          className="absolute bottom-full left-0 z-50 mb-1 w-56 overflow-hidden rounded-lg border border-border bg-surface shadow-raised"
        >
          {candidates.slice(0, 6).map((m, i) => (
            <button
              key={m.user.id}
              type="button"
              role="option"
              aria-selected={i === selectedIndex}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => insertMention(m.user.display_name)}
              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                i === selectedIndex ? "bg-primary-50 dark:bg-surface-warm" : ""
              }`}
            >
              <Avatar className="size-5">
                <AvatarFallback>{initials(m.user.display_name)}</AvatarFallback>
              </Avatar>
              <span className="truncate text-fg">{m.user.display_name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
