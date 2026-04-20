from __future__ import annotations

import warnings
from typing import Any

from pydantic import ConfigDict, TypeAdapter
from langgraph.runtime import Runtime

from deerflow.runtime.runs import worker


def test_build_langgraph_runtime_uses_dict_context_schema_without_serializer_warnings():
    runtime = worker._build_langgraph_runtime(thread_id="thread-123", store=None)
    runtime.context["sandbox_id"] = "local"

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        dumped = TypeAdapter(
            Runtime[dict[str, Any]],
            config=ConfigDict(arbitrary_types_allowed=True),
        ).dump_python(runtime)

    assert dumped["context"] == {"thread_id": "thread-123", "sandbox_id": "local"}
    assert caught == []
