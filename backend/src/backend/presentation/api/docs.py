from pydantic import BaseModel


class BaseDoc(BaseModel):
    message: str


class UnAuthorizedErrorResponse(BaseDoc): ...


class NotFoundErrorResponse(BaseDoc): ...


class BadRequestErrorResponse(BaseDoc): ...


class TooManyRequestsErrorResponse(BaseDoc): ...


class ServiceUnavailableErrorResponse(BaseDoc): ...


class ForbiddenErrorResponse(BaseDoc): ...


class ServiceNotImplementedErrorResponse(BaseDoc): ...


class ConflictErrorResponse(BaseDoc): ...
