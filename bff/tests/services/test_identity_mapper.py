from app.auth.identity_mapper import IdentityMapper
from app.auth.types import AuthIdentity


def test_identity_mapper_creates_linked_local_user(db_session) -> None:
    identity = AuthIdentity(
        provider="local",
        subject="demo",
        email=None,
        claims={"username": "demo"},
    )

    user = IdentityMapper(db_session).resolve_or_create_user(identity)

    assert user.username == "demo"
