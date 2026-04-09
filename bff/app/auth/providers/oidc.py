from time import time

import httpx
from fastapi import status
from jose import JWTError, jwk, jwt

from app.api.errors import error_response
from app.auth.providers.base import AuthProvider
from app.auth.types import AuthIdentity


class OidcAuthProvider(AuthProvider):
    def __init__(self, issuer: str, audience: str, jwks_url: str) -> None:
        self.issuer = issuer
        self.audience = audience
        self.jwks_url = jwks_url

    @property
    def name(self) -> str:
        return "oidc"

    def authenticate_credentials(self, username: str, password: str) -> AuthIdentity:
        raise error_response(
            status.HTTP_400_BAD_REQUEST,
            "provider_not_enabled",
            "OIDC provider does not support local login",
        )

    def resolve_token_identity(self, user_id: str) -> AuthIdentity:
        raise error_response(
            status.HTTP_400_BAD_REQUEST,
            "provider_not_enabled",
            "OIDC provider expects bearer id_token",
        )

    def resolve_bearer_identity(self, token: str) -> AuthIdentity:
        claims = self._decode_with_jwks(token, self._get_jwks())

        if claims.get("iss") != self.issuer:
            raise error_response(status.HTTP_401_UNAUTHORIZED, "invalid_token", "Invalid token issuer")

        audience = claims.get("aud")
        if isinstance(audience, list):
            audience_valid = self.audience in audience
        else:
            audience_valid = audience == self.audience
        if not audience_valid:
            raise error_response(
                status.HTTP_401_UNAUTHORIZED,
                "invalid_token",
                "Invalid token audience",
            )

        expires_at = claims.get("exp")
        if not isinstance(expires_at, int) or expires_at <= int(time()):
            raise error_response(status.HTTP_401_UNAUTHORIZED, "invalid_token", "Token expired")

        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject:
            raise error_response(
                status.HTTP_401_UNAUTHORIZED,
                "invalid_token",
                "Missing token subject",
            )

        email = claims.get("email")
        if not isinstance(email, str):
            email = None

        return AuthIdentity(
            provider="oidc",
            subject=subject,
            email=email,
            claims={
                key: value
                for key, value in claims.items()
                if value is None or isinstance(value, (str, int, bool))
            },
        )

    def _get_jwks(self) -> dict:
        response = httpx.get(self.jwks_url, timeout=5.0)
        response.raise_for_status()
        return response.json()

    def _decode_with_jwks(self, token: str, jwks: dict) -> dict:
        try:
            header = jwt.get_unverified_header(token)
            key_data = next(key for key in jwks["keys"] if key.get("kid") == header["kid"])
            key = jwk.construct(key_data)
            message, signature = token.rsplit(".", 1)
            if not key.verify(message.encode(), jwt.base64url_decode(signature.encode())):
                raise error_response(
                    status.HTTP_401_UNAUTHORIZED,
                    "invalid_token",
                    "Invalid token signature",
                )
            return jwt.get_unverified_claims(token)
        except StopIteration as exc:
            raise error_response(status.HTTP_401_UNAUTHORIZED, "invalid_token", "Signing key not found") from exc
        except (JWTError, KeyError, ValueError) as exc:
            raise error_response(status.HTTP_401_UNAUTHORIZED, "invalid_token", "Invalid token") from exc
