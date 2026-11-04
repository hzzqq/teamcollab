/* ============================================================
   auth.ts — token 持久化（access + refresh）与读取
   access token 有效期 15 分钟，refresh token 用于 401 自动续期
   ============================================================ */

const ACCESS_KEY = "teamcollab.access_token";
const REFRESH_KEY = "teamcollab.refresh_token";

/* ---------------- token 变更订阅 ----------------
 * SSE 长连接把 access token 拼在 URL 里，token 刷新后必须重建 EventSource，
 * 否则断线重连会一直用过期 token → 401 → 实时通知永久失效。
 * 这里用最小订阅机制把 token 变更广播给需要重建连接的组件。
 */
type TokenListener = () => void;
const tokenListeners = new Set<TokenListener>();

function notifyTokenChanged(): void {
  for (const listener of tokenListeners) {
    try {
      listener();
    } catch {
      // 单个订阅者异常不影响其他订阅者
    }
  }
}

/** 订阅 token 变更；返回取消订阅函数。 */
export function subscribeTokenChange(listener: TokenListener): () => void {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_KEY, access);
  window.localStorage.setItem(REFRESH_KEY, refresh);
  notifyTokenChanged();
}

export function setAccessToken(access: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_KEY, access);
  notifyTokenChanged();
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  notifyTokenChanged();
}
