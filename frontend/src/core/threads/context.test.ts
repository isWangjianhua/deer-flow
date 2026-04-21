import assert from "node:assert/strict";
import test from "node:test";

const { buildAgentRunContext } = await import(
  new URL("./context.ts", import.meta.url).href,
);

void test("maps local settings context into shared agent run context defaults", () => {
  assert.deepEqual(
    buildAgentRunContext({
      model_name: "gpt-5",
      mode: "flash",
      reasoning_effort: undefined,
    }),
    {
      model_name: "gpt-5",
      thinking_enabled: false,
      is_plan_mode: false,
      subagent_enabled: false,
      reasoning_effort: undefined,
    },
  );

  assert.deepEqual(
    buildAgentRunContext({
      model_name: "gpt-5",
      mode: "thinking",
      reasoning_effort: undefined,
    }),
    {
      model_name: "gpt-5",
      thinking_enabled: true,
      is_plan_mode: false,
      subagent_enabled: false,
      reasoning_effort: "low",
    },
  );

  assert.deepEqual(
    buildAgentRunContext({
      model_name: "gpt-5",
      mode: "pro",
      reasoning_effort: undefined,
    }),
    {
      model_name: "gpt-5",
      thinking_enabled: true,
      is_plan_mode: true,
      subagent_enabled: false,
      reasoning_effort: "medium",
    },
  );

  assert.deepEqual(
    buildAgentRunContext({
      model_name: "gpt-5",
      mode: "ultra",
      reasoning_effort: undefined,
    }),
    {
      model_name: "gpt-5",
      thinking_enabled: true,
      is_plan_mode: true,
      subagent_enabled: true,
      reasoning_effort: "high",
    },
  );
});

void test("preserves an explicit reasoning effort override", () => {
  assert.deepEqual(
    buildAgentRunContext({
      model_name: "gpt-5",
      mode: "flash",
      reasoning_effort: "high",
    }),
    {
      model_name: "gpt-5",
      thinking_enabled: false,
      is_plan_mode: false,
      subagent_enabled: false,
      reasoning_effort: "high",
    },
  );
});
