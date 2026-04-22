from app.models.agent_ownership import AgentOwnership
from app.models.user import User
from app.repositories.agent_ownership_repo import AgentOwnershipRepository


def test_create_and_read_agent_ownership(db_session) -> None:
    user = User(username="alice", password_hash="hashed")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    repo = AgentOwnershipRepository(db_session)
    created = repo.create(
        AgentOwnership(
            agent_name="demo-agent",
            owner_user_id=user.id,
        )
    )
    fetched = repo.get_by_agent_name("demo-agent")

    assert created.id is not None
    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.owner_user_id == user.id


def test_list_agent_names_by_owner(db_session) -> None:
    alice = User(username="alice", password_hash="hashed")
    bob = User(username="bob", password_hash="hashed")
    db_session.add_all([alice, bob])
    db_session.commit()
    db_session.refresh(alice)
    db_session.refresh(bob)

    repo = AgentOwnershipRepository(db_session)
    repo.create(AgentOwnership(agent_name="alpha", owner_user_id=alice.id))
    repo.create(AgentOwnership(agent_name="beta", owner_user_id=alice.id))
    repo.create(AgentOwnership(agent_name="gamma", owner_user_id=bob.id))

    owned_agent_names = repo.list_agent_names_by_owner(alice.id)

    assert set(owned_agent_names) == {"alpha", "beta"}
