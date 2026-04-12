import assert from "node:assert/strict";
import test from "node:test";

const { needsRichMarkdownRendering } = await import(
  new URL("./markdown-content-heuristics.ts", import.meta.url).href,
);

void test("keeps plain text on the lightweight message renderer path", () => {
  assert.equal(
    needsRichMarkdownRendering("This is a plain assistant reply."),
    false,
  );
  assert.equal(
    needsRichMarkdownRendering("Line one.\nLine two."),
    false,
  );
});

void test("uses the rich renderer for markdown structures and links", () => {
  assert.equal(
    needsRichMarkdownRendering("Visit https://example.com for details."),
    true,
  );
  assert.equal(
    needsRichMarkdownRendering("Use `npm run dev` to start the app."),
    true,
  );
  assert.equal(
    needsRichMarkdownRendering("- first item\n- second item"),
    true,
  );
  assert.equal(
    needsRichMarkdownRendering("[Open docs](https://example.com/docs)"),
    true,
  );
});

void test("uses the rich renderer for math and html markup", () => {
  assert.equal(needsRichMarkdownRendering("The result is $x^2 + y^2$."), true);
  assert.equal(needsRichMarkdownRendering("<details>debug</details>"), true);
});
