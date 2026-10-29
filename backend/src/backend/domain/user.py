from dataclasses import dataclass, field
from uuid import UUID


@dataclass
class User:
    id: UUID
    email: str
    password_hash: str = field(repr=False)
