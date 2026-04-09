from app.auth.providers.local import LocalAuthProvider
from app.core.security import get_password_hash
from app.models.user import User


def test_local_auth_provider_authenticates_local_user(db_session) -> None:
    db_session.add(User(username="alice", password_hash=get_password_hash("pw123")))
    db_session.commit()

    identity = LocalAuthProvider(db_session).authenticate_credentials("alice", "pw123")

    assert identity.provider == "local"
    assert identity.subject == "alice"
