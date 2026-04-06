import { describe, expect, it } from "vitest";

import { summarizeToolResult } from "./assistant-step-summaries";

describe("assistant step summaries", () => {
  it("hides raw web fetch markdown and shows a compact title summary", () => {
    const summary = summarizeToolResult("web_fetch", { url: "https://example.com" }, undefined, `# Beijing Weather

[全国](http://www.weather.com.cn/forecast/)>
晴转多云，最高气温 18C`);

    expect(summary).toEqual({
      mode: "text",
      text: "Beijing Weather",
    });
  });

  it("shows compact web search result titles", () => {
    const summary = summarizeToolResult(
      "web_search",
      { query: "北京天气" },
      {
        results: [
          { title: "北京天气预报,北京7天天气预报,北京15天天气预报,北京天气查询" },
          { title: "北京天气历史记录 www.ip138.com" },
          { title: "北京市天气预报24小时 - 北京天气预报未来15天" },
        ],
      },
      undefined,
    );

    expect(summary).toEqual({
      mode: "text",
      text: [
        "北京天气预报,北京7天天气预报,北京15天天气预报,北京天气查询",
        "北京天气历史记录 www.ip138.com",
        "北京市天气预报24小时 - 北京天气预报未来15天",
      ].join("\n"),
    });
  });

  it("returns hidden when a tool is still running without a result", () => {
    expect(
      summarizeToolResult("web_fetch", { url: "https://example.com" }, undefined, undefined, true),
    ).toEqual({
      mode: "hidden",
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
      mode: "text",
      text: "北京天气预报,北京7天天气预报,北京15天天气预报,北京天气查询",
    });
  });
});
