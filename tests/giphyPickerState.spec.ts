import { expect, test } from "@playwright/test";
import {
  copyGifMarkdown,
  getCopyGifShortcutLabel,
  getGifMarkdown,
  getGiphyResultState,
  isCopyGifShortcut,
  resolveCommandPaletteContext,
} from "../src/components/giphyPickerState";

test("loading takes precedence while a replacement search is in flight", () => {
  expect(
    getGiphyResultState({
      isLoading: true,
      error: "",
      resultCount: 24,
    }),
  ).toBe("loading");
});

test("reports error, ready, and empty result states", () => {
  expect(
    getGiphyResultState({
      isLoading: false,
      error: "Failed to load GIFs.",
      resultCount: 0,
    }),
  ).toBe("error");
  expect(
    getGiphyResultState({
      isLoading: false,
      error: "",
      resultCount: 24,
    }),
  ).toBe("ready");
  expect(
    getGiphyResultState({
      isLoading: false,
      error: "",
      resultCount: 0,
    }),
  ).toBe("empty");
});

test("recognizes Control-C and Command-C as copy GIF shortcuts", () => {
  expect(isCopyGifShortcut({ key: "c", ctrlKey: true, metaKey: false })).toBe(
    true,
  );
  expect(isCopyGifShortcut({ key: "C", ctrlKey: false, metaKey: true })).toBe(
    true,
  );
  expect(isCopyGifShortcut({ key: "c", ctrlKey: false, metaKey: false })).toBe(
    false,
  );
  expect(isCopyGifShortcut({ key: "v", ctrlKey: true, metaKey: false })).toBe(
    false,
  );
});

test("labels the copy shortcut for the current platform", () => {
  expect(getCopyGifShortcutLabel("MacIntel")).toBe("⌘C");
  expect(getCopyGifShortcutLabel("Win32")).toBe("Ctrl-C");
  expect(getCopyGifShortcutLabel("Linux x86_64")).toBe("Ctrl-C");
});

test("uses the captured caret for a matching command palette block", () => {
  expect(
    resolveCommandPaletteContext({
      focusedBlockUid: "abc123def",
      focusedBlockText: "before after",
      lastBlockContext: { blockUid: "abc123def", insertAt: 7 },
    }),
  ).toEqual({ blockUid: "abc123def", insertAt: 7 });
});

test("falls back to the end when the captured block does not match", () => {
  expect(
    resolveCommandPaletteContext({
      focusedBlockUid: "focused01",
      focusedBlockText: "append here",
      lastBlockContext: { blockUid: "stale0001", insertAt: 3 },
    }),
  ).toEqual({ blockUid: "focused01", insertAt: 11 });
});

test("formats the same GIF markdown used for insertion", () => {
  expect(
    getGifMarkdown({
      title: "Loop [Jump] GIF",
      originalUrl: "https://media.giphy.com/original.gif",
    }),
  ).toBe("![Loop Jump GIF](https://media.giphy.com/original.gif)");
});

test("copies the selected GIF's markdown", async () => {
  let copiedText = "";
  const copied = await copyGifMarkdown({
    title: "Loop Jump GIF",
    originalUrl: "https://media.giphy.com/original.gif",
    fallbackUrl: "https://giphy.com/fallback",
    clipboard: {
      writeText: async (text) => {
        copiedText = text;
      },
    },
  });

  expect(copied).toBe(true);
  expect(copiedText).toBe(
    "![Loop Jump GIF](https://media.giphy.com/original.gif)",
  );
});
