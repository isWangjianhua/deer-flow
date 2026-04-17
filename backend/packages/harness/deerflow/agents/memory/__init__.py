"""Memory module for DeerFlow.

This module provides a global memory mechanism that:
- Stores user context and conversation history in memory.json
- Uses LLM to summarize and extract facts from conversations
- Injects relevant memory into system prompts for personalized responses
"""

from deerflow.agents.memory.mem0_service import Mem0Service, get_mem0_service, reset_mem0_service
from deerflow.agents.memory.memory_retrieval import build_mem0_injection_memory
from deerflow.agents.memory.prompt import (
    FACT_EXTRACTION_PROMPT,
    MEM0_FACT_EXTRACTION_PROMPT,
    MEM0_UPDATE_MEMORY_PROMPT,
    MEMORY_UPDATE_PROMPT,
    format_conversation_for_update,
    format_memory_for_injection,
)
from deerflow.agents.memory.queue import (
    ConversationContext,
    MemoryUpdateQueue,
    get_memory_queue,
    reset_memory_queue,
)
from deerflow.agents.memory.storage import (
    FileMemoryStorage,
    MemoryStorage,
    get_memory_storage,
)
from deerflow.agents.memory.updater import (
    MemoryUpdater,
    clear_memory_data,
    create_memory_fact,
    delete_memory_fact,
    get_memory_data,
    import_memory_data,
    reload_memory_data,
    update_memory_fact,
    update_memory_from_conversation,
)

__all__ = [
    # Prompt utilities
    "MEMORY_UPDATE_PROMPT",
    "FACT_EXTRACTION_PROMPT",
    "MEM0_FACT_EXTRACTION_PROMPT",
    "MEM0_UPDATE_MEMORY_PROMPT",
    "format_memory_for_injection",
    "format_conversation_for_update",
    # Queue
    "ConversationContext",
    "MemoryUpdateQueue",
    "get_memory_queue",
    "reset_memory_queue",
    # Storage
    "MemoryStorage",
    "FileMemoryStorage",
    "get_memory_storage",
    "Mem0Service",
    "get_mem0_service",
    "reset_mem0_service",
    "build_mem0_injection_memory",
    # Updater
    "MemoryUpdater",
    "clear_memory_data",
    "create_memory_fact",
    "delete_memory_fact",
    "get_memory_data",
    "import_memory_data",
    "reload_memory_data",
    "update_memory_fact",
    "update_memory_from_conversation",
]
