# TeamCollab 前端镜像（Next.js standalone 多阶段构建）
# 构建参数：NEXT_PUBLIC_API_SAME_ORIGIN=1（同源模式，经 nginx 反代 /api）
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_MODE=real
ARG NEXT_PUBLIC_API_SAME_ORIGIN=1
ENV NEXT_PUBLIC_API_MODE=$NEXT_PUBLIC_API_MODE \
    NEXT_PUBLIC_API_SAME_ORIGIN=$NEXT_PUBLIC_API_SAME_ORIGIN

RUN npm run build

# ---- 运行时：仅 standalone 产物 ----
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
