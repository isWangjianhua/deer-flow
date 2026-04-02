import { describe, expect, it } from "vitest";

import {
  getArtifactKindLabel,
  getArtifactName,
  getArtifactPreviewKind,
  resolveArtifactUrl,
  selectCanvasArtifact,
} from "./artifacts";

describe("artifacts", () => {
  it("builds a browser-accessible artifact url from the conversation id", () => {
    expect(
      resolveArtifactUrl({
        artifactPath: "/tmp/report.md",
        conversationId: "thread_123",
      }),
    ).toBe("/api/threads/thread_123/artifacts/tmp/report.md");
  });

  it("supports download urls for artifact actions", () => {
    expect(
      resolveArtifactUrl({
        artifactPath: "/tmp/report.md",
        conversationId: "thread_123",
        download: true,
      }),
    ).toBe("/api/threads/thread_123/artifacts/tmp/report.md?download=true");
  });

  it("infers preview modes from file extensions", () => {
    expect(getArtifactPreviewKind("/tmp/report.md")).toBe("markdown");
    expect(getArtifactPreviewKind("/tmp/preview.html")).toBe("html");
    expect(getArtifactPreviewKind("/tmp/chart.png")).toBe("image");
    expect(getArtifactPreviewKind("/tmp/report.pdf")).toBe("pdf");
    expect(getArtifactPreviewKind("/tmp/log.txt")).toBe("text");
    expect(getArtifactPreviewKind("/tmp/archive.bin")).toBe("none");
  });

  it("keeps the current canvas selection when the artifact still exists", () => {
    expect(
      selectCanvasArtifact(
        ["/tmp/one.md", "/tmp/two.md"],
        "/tmp/two.md",
      ),
    ).toBe("/tmp/two.md");
  });

  it("falls back to the first artifact when the selection disappears", () => {
    expect(
      selectCanvasArtifact(
        ["/tmp/one.md", "/tmp/two.md"],
        "/tmp/missing.md",
      ),
    ).toBe("/tmp/one.md");
    expect(selectCanvasArtifact([], "/tmp/one.md")).toBeNull();
  });

  it("derives stable labels and names for the canvas list", () => {
    expect(getArtifactName("/tmp/folder/report.final.md")).toBe("report.final.md");
    expect(getArtifactKindLabel("/tmp/folder/report.final.md")).toBe("MD");
    expect(getArtifactKindLabel("/tmp/folder/README")).toBe("FILE");
  });
});
