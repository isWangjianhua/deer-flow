import { describe, expect, it } from "vitest";

import { summarizeToolResult } from "./assistant-step-summaries";

describe("assistant step summaries", () => {
  it("hides raw web fetch markdown and shows a compact title summary", () => {
    const summary = summarizeToolResult("web_fetch", { url: "https://example.com" }, undefined, `# Beijing Weather

[全国](http://www.weather.com.cn/forecast/)>
晴转多云，最高气温 18C`);

    expect(summary).toEqual({
      mode: "pills",
      items: [{ label: "Beijing Weather", href: "https://example.com" }],
    });
  });

  it("shows compact web search result titles", () => {
    const summary = summarizeToolResult(
      "web_search",
      { query: "北京天气" },
      {
        results: [
          { title: "北京天气预报,北京7天天气预报,北京15天天气预报,北京天气查询", url: "https://example.com/1" },
          { title: "北京天气历史记录 www.ip138.com", url: "https://example.com/2" },
          { title: "北京市天气预报24小时 - 北京天气预报未来15天", url: "https://example.com/3" },
        ],
      },
      undefined,
    );

    expect(summary).toEqual({
      mode: "pills",
      items: [
        { label: "北京天气预报,北京7天天气预报,北京15天天气预报,北京天气查询", href: "https://example.com/1" },
        { label: "北京天气历史记录 www.ip138.com", href: "https://example.com/2" },
        { label: "北京市天气预报24小时 - 北京天气预报未来15天", href: "https://example.com/3" },
      ],
    });
  });

  it("extracts clickable items from markdown links when structured web search results are unavailable", () => {
    const summary = summarizeToolResult(
      "web_search",
      { query: "上海天气" },
      undefined,
      `
- [上海天气预报一周](https://example.com/shanghai-7d)
- [上海天气15天](https://example.com/shanghai-15d)
      `,
    );

    expect(summary).toEqual({
      mode: "pills",
      items: [
        { label: "上海天气预报一周", href: "https://example.com/shanghai-7d" },
        { label: "上海天气15天", href: "https://example.com/shanghai-15d" },
      ],
    });
  });

  it("hides unstructured web search plain text to avoid leaking reasoning into tool pills", () => {
    const summary = summarizeToolResult(
      "web_search",
      { query: "上海天气" },
      undefined,
      `用户想要查询明天上海的天气，让我先搜索一下上海明天的天气情况。`,
    );

    expect(summary).toEqual({
      mode: "hidden",
    });
  });

  it("returns hidden when a tool is still running without a result", () => {
    expect(
      summarizeToolResult("web_fetch", { url: "https://example.com" }, undefined, undefined, true),
    ).toEqual({
      mode: "hidden",
    });
  });

  it("shows web search result pills during streaming once structured results are available", () => {
    const summary = summarizeToolResult(
      "web_search",
      { query: "深圳天气" },
      {
        results: [
          { title: "深圳天气预报", url: "https://example.com/shenzhen" },
          { title: "深圳一周天气", url: "https://example.com/shenzhen-7d" },
        ],
      },
      undefined,
      true,
    );

    expect(summary).toEqual({
      mode: "pills",
      items: [
        { label: "深圳天气预报", href: "https://example.com/shenzhen" },
        { label: "深圳一周天气", href: "https://example.com/shenzhen-7d" },
      ],
    });
  });

  it("extracts web fetch summaries from markdown content strings", () => {
    const summary = summarizeToolResult(
      "web_fetch",
      { url: "https://weather.com/beijing" },
      undefined,
      `# 北京天气预报,北京7天天气预报,北京15天天气预报,北京天气查询

[全国](http://www.weather.com.cn/forecast/)>
更多正文内容`,
      false,
    );

    expect(summary).toEqual({
      mode: "pills",
      items: [
        {
          label: "北京天气预报,北京7天天气预报,北京15天天气预报,北京天气查询",
          href: "https://weather.com/beijing",
        },
      ],
    });
  });
});
