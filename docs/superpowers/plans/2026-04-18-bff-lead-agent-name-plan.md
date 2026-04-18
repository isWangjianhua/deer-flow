# Plan: BFF-configured default lead agent name

1. Add failing tests for settings parsing and stream payload forwarding.
2. Extend BFF settings with a default lead agent name field.
3. Update the conversation stream route to derive DeerFlow `config` from BFF settings.
4. Update the DeerFlow client to send optional `config` alongside existing `context`.
5. Refresh BFF docs and example env configuration.
6. Run targeted BFF tests for config, route behavior, and client payload construction.
