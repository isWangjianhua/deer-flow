from dataclasses import dataclass, field


@dataclass(slots=True)
class AuthIdentity:
    provider: str
    subject: str
    email: str | None = None
    claims: dict[str, str | int | bool | None] = field(default_factory=dict)
