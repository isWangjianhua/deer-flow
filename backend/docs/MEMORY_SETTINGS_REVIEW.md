# Legacy File Memory Review

Use this only when reviewing the legacy file-backed runtime memory fixture
locally.

The browser-facing `Settings > Memory` surface has been removed. Runtime memory
still exists, but it is now owned by the backend/harness rather than by a
frontend CRUD page.

## Quick Review

1. Start DeerFlow locally using any working development setup you already use.

   Examples:

   ```bash
   make dev
   ```

   or

   ```bash
   make docker-start
   ```

   If you already have DeerFlow running locally, you can reuse that existing setup.

2. Load the sample memory fixture.

   ```bash
   python scripts/load_memory_sample.py
   ```

3. Inspect the seeded runtime memory.

   Example options:
   - inspect `backend/.deer-flow/memory.json` directly
   - call `DeerFlowClient.get_memory()` / `get_memory_status()` in a local
     backend or client verification flow
   - run any targeted backend test that exercises file-backed memory behavior

## Minimal Manual Check

1. Confirm `backend/.deer-flow/memory.json` now exists after running the loader.
2. Confirm the JSON contains the seeded `facts` entries from the sample fixture.
3. If you overwrite an existing target without `--no-backup`, confirm a
   timestamped backup file was created beside the target.

## Optional Sanity Checks

- Switch the runtime to the file-backed memory provider when you want an
  end-to-end local check against this fixture.
- Use the fixture as stable input for backend/client tests that need predictable
  memory contents.

## Fixture Files

- Sample fixture: `backend/docs/memory-settings-sample.json`
- Default local runtime target: `backend/.deer-flow/memory.json`

The loader script creates a timestamped backup automatically before overwriting an existing runtime memory file.
