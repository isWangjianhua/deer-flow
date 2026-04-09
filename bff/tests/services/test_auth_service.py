from app.core.security import get_password_hash, verify_password


def test_password_hash_round_trip() -> None:
    password = "secret123"
    password_hash = get_password_hash(password)

    assert password_hash != password
    assert verify_password(password, password_hash) is True
    assert verify_password("wrong", password_hash) is False
