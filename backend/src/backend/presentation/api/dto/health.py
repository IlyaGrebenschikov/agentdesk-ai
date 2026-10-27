from typing import Literal

from backend.presentation.api.dto.base import BaseResponseDTO


class HealthCheckResponse(BaseResponseDTO):
    status: Literal["ok"] = "ok"
