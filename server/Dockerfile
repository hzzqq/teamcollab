# TeamCollab 后端镜像（FastAPI + Alembic）
# 运行时只装 requirements.txt（pytest/httpx 等开发依赖在 requirements-dev.txt）
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

# 非 root 运行
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# 迁移由 compose 的 migrate 一次性服务执行；本服务只起进程
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
