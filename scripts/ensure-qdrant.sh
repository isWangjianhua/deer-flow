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
            gsub(/^["'"'"']|["'"'"']$/, "", val)
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
                in_mem0_block = 0
                in_vector_store = 0
                in_vector_config = 0
                next
            }

            if (in_memory && indent <= memory_indent) {
                in_memory = 0
                in_mem0_block = 0
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

            if (indent == memory_indent + 2 && raw ~ /^[[:space:]]*(mem0_config|mem0):[[:space:]]*$/) {
                in_mem0_block = 1
                mem0_indent = indent
                in_vector_store = 0
                in_vector_config = 0
                next
            }

            if (in_mem0_block && indent <= mem0_indent) {
                in_mem0_block = 0
                in_vector_store = 0
                in_vector_config = 0
            }
            if (!in_mem0_block) {
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

check_qdrant_health() {
    local host="$1"
    local port="$2"

    if command -v curl >/dev/null 2>&1; then
        curl -fsS --max-time 2 "http://$host:$port/healthz" >/dev/null 2>&1
        return $?
    fi

    "$REPO_ROOT/scripts/wait-for-port.sh" "$port" 1 "Qdrant" >/dev/null 2>&1
}

wait_for_qdrant_health() {
    local host="$1"
    local port="$2"
    local attempts="${3:-30}"
    local delay="${4:-1}"
    local count=0

    until check_qdrant_health "$host" "$port"; do
        count=$((count + 1))
        if [ "$count" -ge "$attempts" ]; then
            return 1
        fi
        sleep "$delay"
    done
}

detect_container_runtime() {
    for candidate in docker podman; do
        if command -v "$candidate" >/dev/null 2>&1; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

container_exists() {
    local runtime="$1"
    local name="$2"
    "$runtime" ps -a --format '{{.Names}}' 2>/dev/null | grep -Fxq "$name"
}

start_existing_container() {
    local runtime="$1"
    local name="$2"
    echo "Starting existing Qdrant container: $name"
    "$runtime" start "$name" >/dev/null
}

run_new_container() {
    local runtime="$1"
    local name="$2"
    local port="$3"
    local storage_dir="$4"
    echo "Starting Qdrant container: $name"
    "$runtime" run -d \
        --name "$name" \
        --restart unless-stopped \
        -p "$port:6333" \
        -v "$storage_dir:/qdrant/storage" \
        qdrant/qdrant:latest >/dev/null
}

print_manual_start_help() {
    local runtime="$1"
    local host="$2"
    local port="$3"
    local container_name="$4"
    local storage_dir="$5"

    echo "Qdrant is required for Mem0, but it is not reachable."
    echo "Expected health check: http://$host:$port/healthz"
    echo ""
    echo "To start a local Qdrant container manually:"
    echo "  $runtime run -d \\"
    echo "    --name $container_name \\"
    echo "    --restart unless-stopped \\"
    echo "    -p $port:6333 \\"
    echo "    -v \"$storage_dir:/qdrant/storage\" \\"
    echo "    qdrant/qdrant:latest"
}

eval "$(parse_memory_config)"

MEMORY_PROVIDER="${MEMORY_PROVIDER:-}"
VECTOR_STORE_PROVIDER="${VECTOR_STORE_PROVIDER:-}"
QDRANT_HOST="${QDRANT_HOST:-127.0.0.1}"
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

if check_qdrant_health "$QDRANT_HOST" "$QDRANT_PORT"; then
    echo "Qdrant is already healthy at $QDRANT_HOST:$QDRANT_PORT"
    exit 0
fi

if [ "$MODE" = "prod" ]; then
    if $LOCAL_TARGET; then
        echo "Qdrant is required but not reachable on $QDRANT_HOST:$QDRANT_PORT"
        echo "Production startup will rely on docker compose to start the qdrant service."
        exit 0
    fi

    echo "Qdrant is required but configured with a non-local host: $QDRANT_HOST:$QDRANT_PORT"
    echo "Start that remote Qdrant instance before continuing."
    exit 1
fi

if ! $LOCAL_TARGET; then
    echo "Qdrant is required but configured with a non-local host: $QDRANT_HOST:$QDRANT_PORT"
    echo "Start that remote Qdrant instance before running serve.sh."
    exit 1
fi

if ! runtime="$(detect_container_runtime)"; then
    echo "Qdrant is required for Mem0, but no docker/podman runtime was found."
    exit 1
fi

QDRANT_CONTAINER_NAME="${QDRANT_CONTAINER_NAME:-${DEER_FLOW_QDRANT_CONTAINER:-deer-flow-qdrant}}"
QDRANT_STORAGE_DIR="${QDRANT_STORAGE_DIR:-$REPO_ROOT/.tmp/qdrant_storage}"

if container_exists "$runtime" "$QDRANT_CONTAINER_NAME"; then
    start_existing_container "$runtime" "$QDRANT_CONTAINER_NAME"
else
    mkdir -p "$QDRANT_STORAGE_DIR"
    run_new_container "$runtime" "$QDRANT_CONTAINER_NAME" "$QDRANT_PORT" "$QDRANT_STORAGE_DIR" || {
        print_manual_start_help "$runtime" "$QDRANT_HOST" "$QDRANT_PORT" "$QDRANT_CONTAINER_NAME" "$QDRANT_STORAGE_DIR"
        exit 1
    }
fi

if ! wait_for_qdrant_health "$QDRANT_HOST" "$QDRANT_PORT" 30 1; then
    echo "Qdrant container '$QDRANT_CONTAINER_NAME' started but health check still failed at $QDRANT_HOST:$QDRANT_PORT"
    exit 1
fi

echo "Qdrant is ready on $QDRANT_HOST:$QDRANT_PORT"
