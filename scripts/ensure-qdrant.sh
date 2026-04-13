#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(builtin cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd -P)"

MODE="dev"
PRINT_REQUIRED=false

for arg in "$@"; do
    case "$arg" in
        --mode=dev|--mode=prod)
            MODE="${arg#--mode=}"
            ;;
        --print-required)
            PRINT_REQUIRED=true
            ;;
        *)
            echo "Unknown argument: $arg"
            echo "Usage: $0 [--mode=dev|--mode=prod] [--print-required]"
            exit 1
            ;;
    esac
done

if [ -n "${DEER_FLOW_CONFIG_PATH:-}" ]; then
    CONFIG_PATH="$DEER_FLOW_CONFIG_PATH"
elif [ -f "$REPO_ROOT/backend/config.yaml" ]; then
    CONFIG_PATH="$REPO_ROOT/backend/config.yaml"
else
    CONFIG_PATH="$REPO_ROOT/config.yaml"
fi

if [ ! -f "$CONFIG_PATH" ]; then
    echo "Qdrant preflight skipped: config file not found at $CONFIG_PATH"
    exit 0
fi

parse_memory_config() {
    awk '
        function trim(val) {
            sub(/^[[:space:]]+/, "", val)
            sub(/[[:space:]]+$/, "", val)
            return val
        }
        {
            raw = $0
            sub(/[[:space:]]+#.*$/, "", raw)
            if (raw ~ /^[[:space:]]*$/) {
                next
            }

            match($0, /^[[:space:]]*/)
            indent = RLENGTH

            if (raw ~ /^[[:space:]]*memory:[[:space:]]*$/) {
                in_memory = 1
                memory_indent = indent
                in_mem0 = 0
                in_vector_store = 0
                in_vector_config = 0
                next
            }

            if (in_memory && indent <= memory_indent) {
                in_memory = 0
                in_mem0 = 0
                in_vector_store = 0
                in_vector_config = 0
            }
            if (!in_memory) {
                next
            }

            if (indent == memory_indent + 2 && raw ~ /^[[:space:]]*provider:[[:space:]]*/) {
                value = raw
                sub(/^[[:space:]]*provider:[[:space:]]*/, "", value)
                print "MEMORY_PROVIDER=" trim(value)
                next
            }

            if (indent == memory_indent + 2 && raw ~ /^[[:space:]]*mem0_config:[[:space:]]*$/) {
                in_mem0 = 1
                mem0_indent = indent
                in_vector_store = 0
                in_vector_config = 0
                next
            }

            if (in_mem0 && indent <= mem0_indent) {
                in_mem0 = 0
                in_vector_store = 0
                in_vector_config = 0
            }
            if (!in_mem0) {
                next
            }

            if (indent == mem0_indent + 2 && raw ~ /^[[:space:]]*vector_store:[[:space:]]*$/) {
                in_vector_store = 1
                vector_store_indent = indent
                in_vector_config = 0
                next
            }

            if (in_vector_store && indent <= vector_store_indent) {
                in_vector_store = 0
                in_vector_config = 0
            }
            if (!in_vector_store) {
                next
            }

            if (indent == vector_store_indent + 2 && raw ~ /^[[:space:]]*provider:[[:space:]]*/) {
                value = raw
                sub(/^[[:space:]]*provider:[[:space:]]*/, "", value)
                print "VECTOR_STORE_PROVIDER=" trim(value)
                next
            }

            if (indent == vector_store_indent + 2 && raw ~ /^[[:space:]]*config:[[:space:]]*$/) {
                in_vector_config = 1
                vector_config_indent = indent
                next
            }

            if (in_vector_config && indent <= vector_config_indent) {
                in_vector_config = 0
            }
            if (!in_vector_config) {
                next
            }

            if (indent == vector_config_indent + 2 && raw ~ /^[[:space:]]*host:[[:space:]]*/) {
                value = raw
                sub(/^[[:space:]]*host:[[:space:]]*/, "", value)
                print "QDRANT_HOST=" trim(value)
                next
            }

            if (indent == vector_config_indent + 2 && raw ~ /^[[:space:]]*port:[[:space:]]*/) {
                value = raw
                sub(/^[[:space:]]*port:[[:space:]]*/, "", value)
                print "QDRANT_PORT=" trim(value)
                next
            }
        }
    ' "$CONFIG_PATH"
}

eval "$(parse_memory_config)"

MEMORY_PROVIDER="${MEMORY_PROVIDER:-}"
VECTOR_STORE_PROVIDER="${VECTOR_STORE_PROVIDER:-}"
QDRANT_HOST="${QDRANT_HOST:-localhost}"
QDRANT_PORT="${QDRANT_PORT:-6333}"

QDRANT_REQUIRED=0
if [ "$MEMORY_PROVIDER" = "mem0" ] && [ "$VECTOR_STORE_PROVIDER" = "qdrant" ]; then
    QDRANT_REQUIRED=1
fi

if $PRINT_REQUIRED; then
    printf "QDRANT_REQUIRED=%q\n" "$QDRANT_REQUIRED"
    printf "QDRANT_HOST=%q\n" "$QDRANT_HOST"
    printf "QDRANT_PORT=%q\n" "$QDRANT_PORT"
    exit 0
fi

if [ "$QDRANT_REQUIRED" != "1" ]; then
    echo "Qdrant preflight skipped: memory.provider=$MEMORY_PROVIDER vector_store.provider=$VECTOR_STORE_PROVIDER"
    exit 0
fi

case "$QDRANT_HOST" in
    localhost|127.0.0.1|0.0.0.0)
        LOCAL_TARGET=true
        ;;
    *)
        LOCAL_TARGET=false
        ;;
esac

if "$REPO_ROOT/scripts/wait-for-port.sh" "$QDRANT_PORT" 1 "Qdrant" >/dev/null 2>&1; then
    echo "Qdrant already available on localhost:$QDRANT_PORT"
    exit 0
fi

if [ "$MODE" = "prod" ]; then
    if $LOCAL_TARGET; then
        echo "Qdrant is required but not reachable on localhost:$QDRANT_PORT"
        echo "Production startup will rely on docker compose to start the qdrant service."
        exit 0
    fi

    echo "Qdrant preflight skipped: using remote vector store at $QDRANT_HOST:$QDRANT_PORT"
    exit 0
fi

if ! $LOCAL_TARGET; then
    echo "Qdrant is required but configured with a non-local host: $QDRANT_HOST:$QDRANT_PORT"
    echo "Start that remote Qdrant instance before running serve.sh."
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "Qdrant is required for Mem0, but Docker is not installed."
    exit 1
fi

QDRANT_CONTAINER_NAME="${QDRANT_CONTAINER_NAME:-deer-flow-qdrant}"
QDRANT_STORAGE_DIR="${QDRANT_STORAGE_DIR:-$REPO_ROOT/.tmp/qdrant_storage}"
mkdir -p "$QDRANT_STORAGE_DIR"

if docker ps -a --format '{{.Names}}' | grep -Fxq "$QDRANT_CONTAINER_NAME"; then
    echo "Starting existing Qdrant container: $QDRANT_CONTAINER_NAME"
    docker start "$QDRANT_CONTAINER_NAME" >/dev/null
else
    echo "Starting Qdrant container: $QDRANT_CONTAINER_NAME"
    docker run -d \
        --name "$QDRANT_CONTAINER_NAME" \
        --restart unless-stopped \
        -p "$QDRANT_PORT:6333" \
        -v "$QDRANT_STORAGE_DIR:/qdrant/storage" \
        qdrant/qdrant:latest >/dev/null
fi

"$REPO_ROOT/scripts/wait-for-port.sh" "$QDRANT_PORT" 30 "Qdrant"
echo "Qdrant is ready on localhost:$QDRANT_PORT"
