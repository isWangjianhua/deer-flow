import assert from "node:assert/strict";
import test from "node:test";

const { copyTextToClipboard } = await import(
  new URL("./clipboard.ts", import.meta.url).href
);

void test("copyTextToClipboard uses navigator clipboard when available", async () => {
  const originalNavigator = globalThis.navigator;
  let copied = "";

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        async writeText(text: string) {
          copied = text;
        },
      },
    },
  });

  assert.equal(await copyTextToClipboard("hello"), true);
  assert.equal(copied, "hello");

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
});

void test("copyTextToClipboard falls back when navigator clipboard is unavailable", async () => {
  const originalNavigator = globalThis.navigator;
  const originalDocument = globalThis.document;
  let selectedText = "";
  let removed = false;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: {
        appendChild(element: { value: string; select: () => void }) {
          selectedText = element.value;
        },
        removeChild() {
          removed = true;
        },
      },
      createElement() {
        return {
          value: "",
          style: {},
          setAttribute(_name: string, _value: string) {
            return undefined;
          },
          select() {
            return undefined;
          },
        };
      },
      execCommand(command: string) {
        return command === "copy";
      },
    },
  });

  assert.equal(await copyTextToClipboard("fallback"), true);
  assert.equal(selectedText, "fallback");
  assert.equal(removed, true);

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
});
