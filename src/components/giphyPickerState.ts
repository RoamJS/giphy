export type GiphyResultState = "loading" | "error" | "ready" | "empty";

export type GiphyPickerContext = {
  blockUid: string;
  insertAt: number;
};

type ClipboardWriter = {
  writeText: (text: string) => Promise<void>;
};

export const getGiphyResultState = ({
  isLoading,
  error,
  resultCount,
}: {
  isLoading: boolean;
  error: string;
  resultCount: number;
}): GiphyResultState => {
  if (isLoading) return "loading";
  if (error) return "error";
  if (resultCount) return "ready";
  return "empty";
};

export const isCopyGifShortcut = ({
  key,
  ctrlKey,
  metaKey,
}: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean => (ctrlKey || metaKey) && key.toLowerCase() === "c";

export const getCopyGifShortcutLabel = (platform: string): string =>
  /Mac|iPhone|iPad|iPod/i.test(platform) ? "⌘C" : "Ctrl-C";

export const resolveCommandPaletteContext = ({
  focusedBlockUid,
  focusedBlockText,
  lastBlockContext,
}: {
  focusedBlockUid: string;
  focusedBlockText: string;
  lastBlockContext: GiphyPickerContext | null;
}): GiphyPickerContext => ({
  blockUid: focusedBlockUid,
  insertAt:
    lastBlockContext?.blockUid === focusedBlockUid
      ? lastBlockContext.insertAt
      : focusedBlockText.length,
});

export const getGifMarkdown = ({
  title,
  originalUrl,
  fallbackUrl,
}: {
  title?: string;
  originalUrl?: string;
  fallbackUrl?: string;
}): string => {
  const url = originalUrl || fallbackUrl;
  if (!url) return "";
  const safeTitle = (title || "gif").replace(/[\[\]()]/g, "");
  return `![${safeTitle}](${url})`;
};

export const copyGifMarkdown = async ({
  title,
  originalUrl,
  fallbackUrl,
  clipboard,
}: {
  title?: string;
  originalUrl?: string;
  fallbackUrl?: string;
  clipboard: ClipboardWriter;
}): Promise<boolean> => {
  const markdown = getGifMarkdown({ title, originalUrl, fallbackUrl });
  if (!markdown) return false;
  await clipboard.writeText(markdown);
  return true;
};
