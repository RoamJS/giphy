export type GiphyResultState = "loading" | "error" | "ready" | "empty";

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
}: {
  key: string;
  ctrlKey: boolean;
}): boolean => ctrlKey && key.toLowerCase() === "c";

export const copyGifLink = async ({
  originalUrl,
  fallbackUrl,
  clipboard,
}: {
  originalUrl?: string;
  fallbackUrl?: string;
  clipboard: ClipboardWriter;
}): Promise<boolean> => {
  const url = originalUrl || fallbackUrl;
  if (!url) return false;
  await clipboard.writeText(url);
  return true;
};
