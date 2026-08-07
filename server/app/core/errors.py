"""错误码与业务异常（统一响应 {code, data, message} 的错误侧）。"""

from typing import Optional

# 错误码 -> HTTP 状态码 映射（openapi-v2 契约）
STATUS_BY_CODE: dict[int, int] = {
    40001: 400,  # 参数校验失败
    40101: 401,  # 未认证或 token 过期
    40301: 403,  # 无权限（RBAC）
    40401: 404,  # 资源不存在（含跨租户，不泄露存在性）
    40901: 409,  # 资源冲突
    42901: 429,  # 频率限制
    50000: 500,  # 服务器内部错误
}


class AppError(Exception):
    """业务异常：携带统一错误码，由全局异常处理器转成 {code,data,message}。"""

    def __init__(self, code: int = 50000, message: str = "服务器内部错误", status_code: Optional[int] = None):
        self.code = code
        self.message = message
        self.status_code = status_code or STATUS_BY_CODE.get(code, 400)
        super().__init__(message)


def bad_request(message: str) -> AppError:
    return AppError(40001, message)


def unauthorized(message: str = "未认证或凭证无效") -> AppError:
    return AppError(40101, message)


def forbidden(message: str = "无权限执行此操作") -> AppError:
    return AppError(40301, message)


def not_found(message: str = "资源不存在") -> AppError:
    return AppError(40401, message)


def conflict(message: str = "资源冲突") -> AppError:
    return AppError(40901, message)


def too_many_requests(message: str = "请求过于频繁，请稍后再试") -> AppError:
    return AppError(42901, message)
