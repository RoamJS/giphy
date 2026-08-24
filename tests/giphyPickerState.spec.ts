import { expect, test } from "@playwright/test";
import {
  copyGifLink,
  getGiphyResultState,
  isCopyGifShortcut,
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

test("recognizes only Control-C as the copy GIF shortcut", () => {
  expect(isCopyGifShortcut({ key: "c", ctrlKey: true })).toBe(true);
  expect(isCopyGifShortcut({ key: "C", ctrlKey: true })).toBe(true);
  expect(isCopyGifShortcut({ key: "c", ctrlKey: false })).toBe(false);
  expect(isCopyGifShortcut({ key: "v", ctrlKey: true })).toBe(false);
});

test("copies the selected GIF's original URL", async () => {
  let copiedText = "";
  const copied = await copyGifLink({
    originalUrl: "https://media.giphy.com/original.gif",
    fallbackUrl: "https://giphy.com/fallback",
    clipboard: {
      writeText: async (text) => {
        copiedText = text;
      },
    },
  });

  expect(copied).toBe(true);
  expect(copiedText).toBe("https://media.giphy.com/original.gif");
});
