from abc import ABC, abstractmethod

from app.auth.types import AuthIdentity


class AuthProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def authenticate_credentials(self, username: str, password: str) -> AuthIdentity:
        raise NotImplementedError

    @abstractmethod
    def resolve_token_identity(self, user_id: str) -> AuthIdentity:
        raise NotImplementedError
