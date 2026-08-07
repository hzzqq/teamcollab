"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, API_MODE } from "@/lib/api";
import type { NotificationItem } from "@/lib/api-types";

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

export function useUnreadCount() {
  const { data } = useNotifications();
  return data?.items.filter((n) => !n.is_read).length ?? 0;
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
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const onEvent = useCallback(
    (event: MessageEvent) => {
      try {
        const notif = JSON.parse(event.data) as NotificationItem;
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
      es.onmessage = onEvent;
      es.onerror = () => {
        setConnected(false);
        // EventSource 自动重连
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
  }, [qc, onEvent]);

  return { connected };
}
