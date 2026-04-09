import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.auth.identity_mapper import IdentityMapper
from app.auth.types import AuthIdentity
from app.core.security import verify_password
from app.models.user import User
from app.models.user_identity import UserIdentity


def test_identity_mapper_creates_linked_local_user(db_session) -> None:
    identity = AuthIdentity(
        provider="local",
        subject="new-subject",
        email="demo@example.com",
        claims={"username": "new-subject"},
    )

    user = IdentityMapper(db_session).resolve_or_create_user(identity)
    link = db_session.scalar(
        select(UserIdentity).where(
            UserIdentity.provider == "local",
            UserIdentity.subject == "new-subject",
        )
    )

    assert user.username == "new-subject"
    assert verify_password("provider-managed-placeholder", user.password_hash)
    assert link is not None
    assert link.user_id == user.id
    assert link.email == "demo@example.com"


def test_identity_mapper_reuses_existing_identity_link(db_session) -> None:
    mapper = IdentityMapper(db_session)
    identity = AuthIdentity(provider="local", subject="demo", claims={"username": "demo"})

    first = mapper.resolve_or_create_user(identity)
    second = mapper.resolve_or_create_user(identity)

    links = db_session.scalars(
        select(UserIdentity).where(
            UserIdentity.provider == "local",
            UserIdentity.subject == "demo",
        )
    ).all()

    assert first.id == second.id
    assert len(links) == 1
    assert links[0].user_id == first.id


def test_identity_mapper_errors_when_mapped_user_is_missing(db_session) -> None:
    user = User(username="orphan", password_hash="hash")
    db_session.add(user)
    db_session.flush()
    db_session.add(
        UserIdentity(
            user_id=user.id,
            provider="local",
            subject="orphan",
            email=None,
            claims_json="{}",
        )
    )
    db_session.delete(user)
    db_session.commit()

    with pytest.raises(HTTPException) as exc_info:
        IdentityMapper(db_session).resolve_or_create_user(
            AuthIdentity(provider="local", subject="orphan", claims={"username": "orphan"})
        )

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == {
        "code": "identity_mapping_failed",
        "message": "Mapped user not found",
    }
