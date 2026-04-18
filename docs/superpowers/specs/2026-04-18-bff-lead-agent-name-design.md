# BFF-configured default lead agent name

## Goal

Allow BFF operators to set a fixed default `agent_name` for the downstream DeerFlow `lead_agent` without exposing DeerFlow runtime config details to frontend clients.

## Scope

- Add a BFF setting for the default lead agent name.
- Forward that value to DeerFlow Gateway as `config.configurable.agent_name` on chat stream requests.
- Keep existing per-request chat context forwarding unchanged.
- Preserve BFF ownership boundaries and avoid exposing DeerFlow internals to the frontend contract.

## Approaches considered

1. Add a frontend request field and let the browser choose the name.
   - Rejected because it leaks DeerFlow runtime concepts into the public BFF contract.
2. Use Gateway `assistant_id="lead_agent"`.
   - Rejected because Gateway intentionally does not map the default assistant id to `configurable.agent_name`.
3. Add a BFF-owned config value and translate it internally.
   - Recommended because it keeps the public API stable and localizes DeerFlow-specific wiring inside the BFF.

## Design

- Add `deerflow_lead_agent_name: str | None` to BFF settings.
- On `POST /conversations/{conversation_id}/messages/stream`, keep the existing `context` payload for user/model/reasoning flags.
- If `deerflow_lead_agent_name` is configured, also send:

```json
{
  "config": {
    "configurable": {
      "agent_name": "<configured-name>"
    }
  }
}
```

- DeerFlow Gateway already forwards `configurable.agent_name` into `make_lead_agent()`, so no backend runtime change is required.

## Error handling

- If the setting is unset, preserve current behavior.
- If the configured name is invalid for downstream validation, let Gateway reject the run as it does today.

## Tests

- Settings test for the new config field.
- BFF route test to confirm the stream request includes the derived `config` block.
- DeerFlow client test to confirm the outgoing JSON body contains both `context` and `config` when provided.

## Documentation

- Update `bff/.env.example`.
- Update `bff/README.md` environment and streaming behavior notes.
