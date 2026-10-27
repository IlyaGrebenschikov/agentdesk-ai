from backend.application.exceptions.common import ServiceUnavailableError


class TransactionError(ServiceUnavailableError): ...


class TransactionAlreadyStartedError(RuntimeError):
    def __init__(self) -> None:
        super().__init__(
            "Session already has an active transaction. "
            "Use TransactionManager for all database operations."
        )


class CommitError(TransactionError):
    def __init__(self, original_error: Exception | None = None) -> None:
        super().__init__("Service unavailable")
        self.original_error = original_error


class RollbackError(TransactionError):
    def __init__(self, original_error: Exception | None = None) -> None:
        super().__init__("Service unavailable")
        self.original_error = original_error
