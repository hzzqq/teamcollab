"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, API_MODE } from "@/lib/api";
import { subscribeTokenChange } from "@/lib/auth";
import { boardQueryKey } from "@/hooks/use-board";
import type { NotificationItem, PaginatedNotifications } from "@/lib/api-types";

export function notificationsQueryKey() {
  return ["notifications"];
}

/** 历史通知 + 未读数 */
export function useNotifications() {
  return useQuery({
    queryKey: notificationsQueryKey(),
    queryFn: () => api.notifications({ page: 1, limit: 20 }),
    staleTime: 15_000,
  });
}

/** 全部标记已读（乐观更新 + 失败回滚；错误提示由全局 mutation onError 负责） */
export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.markAllRead(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: notificationsQueryKey() });
      const previous = qc.getQueryData<PaginatedNotifications>(notificationsQueryKey());
      qc.setQueryData<PaginatedNotifications>(notificationsQueryKey(), (old) => {
        if (!old) return old;
        return {
          ...old,
          unreadTotal: 0,
          items: old.items.map((n) => ({ ...n, is_read: true })),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(notificationsQueryKey(), context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notificationsQueryKey() });
    },
  });
}

/**
 * SSE 实时通知订阅（AC-05/AC-07 通知推送）
 * - real 模式：EventSource（query token）
 * - mock 模式：8s 轮询历史（无 SSE 基础设施）
 * 返回连接状态：connected | disconnected
 */
export function useNotificationStream() {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [tokenVersion, setTokenVersion] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // token 刷新后必须重建 EventSource：SSE URL 里带 access token，
  // 旧 token 过期后断线重连会一直 401 → 实时通知永久失效。
  useEffect(() => {
    return subscribeTokenChange(() => setTokenVersion((v) => v + 1));
  }, []);

  const onEvent = useCallback(
    (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as {
          id?: string;
          type?: string;
          created_at?: string;
          payload?: { board_id?: string };
        };
        if (!parsed || typeof parsed !== "object") return;

        // SSE 流同时承载两类事件：
        // 1) 已落库通知（有 id / type / created_at）
        // 2) board_update 临时帧（只有 type + payload，无 id/created_at）
        if (parsed.type === "board_update") {
          // 看板实时同步：使对应看板查询失效，触发重新拉取
          const boardId = parsed.payload?.board_id;
          if (boardId) {
            qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
          }
          return;
        }

        // 其余为已落库通知，形状校验通过才写入缓存
        if (!parsed.id || !parsed.type || !parsed.created_at) {
          return;
        }
        const notif = parsed as unknown as NotificationItem;
        qc.setQueryData<ReturnType<typeof api.notifications> extends Promise<infer T> ? T : never>(
          notificationsQueryKey(),
          (old) => {
            if (!old) return old;
            return {
              ...old,
              total: old.total + 1,
              items: [notif, ...old.items.filter((n) => n.id !== notif.id)].slice(0, 20),
            };
          },
        );
        qc.invalidateQueries({ queryKey: notificationsQueryKey() });
      } catch {
        // 忽略无法解析的 SSE 帧
      }
    },
    [qc],
  );

  useEffect(() => {
    if (API_MODE === "real") {
      const url = api.notificationsStreamUrl();
      if (!url) return;
      const es = new EventSource(url);
      esRef.current = es;
      es.onopen = () => setConnected(true);
      // 服务端发送的是命名事件（event: notification），onmessage 只收匿名事件
      es.addEventListener("notification", onEvent as EventListener);
      es.onerror = () => {
        setConnected(false);
        // EventSource 自动重连（URL 中的 token 已随 tokenVersion 依赖更新）
      };
      return () => {
        es.close();
        esRef.current = null;
        setConnected(false);
      };
    }

    // mock 模式：轮询
    setConnected(true);
    timerRef.current = setInterval(() => {
      qc.invalidateQueries({ queryKey: notificationsQueryKey() });
    }, 8000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      setConnected(false);
    };
  }, [qc, onEvent, tokenVersion]);

  return { connected };
}
