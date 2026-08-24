import {
  Button,
  Classes,
  Dialog,
  Divider,
  InputGroup,
} from "@blueprintjs/core";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import { GiphyFetch } from "@giphy/js-fetch-api";
import { IGif } from "@giphy/js-types";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import {
  copyGifLink,
  getGiphyResultState,
  isCopyGifShortcut,
} from "./giphyPickerState";

type OpenContext = {
  blockUid?: string;
  insertAt: number;
};

type OverlayController = {
  open: (context: OpenContext) => void;
  close: () => void;
};

const gf = new GiphyFetch("NUeKPL1mNJZJmI2FOP69LA6Np5hIQdXS");
const GIPHY_API_PAUSED = false;
const PICKER_WIDTH = 1400;
const RESULT_VIEWPORT_HEIGHT = "min(720px, calc(100vh - 180px))";
const ROAM_MODAL_SHADOW = "0 8px 28px rgba(0, 0, 0, 0.18)";
const SKELETON_HEIGHTS = [176, 224, 152, 208];
const ROAM_FOOTER_BACKGROUND = "rgb(235, 236, 235)";
const ROAM_FOOTER_BORDER = "rgb(211, 212, 212)";

let rootEl: HTMLDivElement | null = null;
let controller: OverlayController | null = null;
let pendingOpen: OpenContext | null = null;

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(n, max));

const getVerticalGridIndex = ({
  currentIndex,
  direction,
  columns,
  total,
}: {
  currentIndex: number;
  direction: "up" | "down";
  columns: number;
  total: number;
}) => {
  const nextIndex =
    direction === "down" ? currentIndex + columns : currentIndex - columns;
  return nextIndex >= 0 && nextIndex < total ? nextIndex : currentIndex;
};

const getCenter = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
};

const getDirectionalIndex = ({
  currentIndex,
  direction,
  refs,
}: {
  currentIndex: number;
  direction: "left" | "right" | "up" | "down";
  refs: Array<HTMLButtonElement | null>;
}) => {
  const current = refs[currentIndex];
  if (!current) return currentIndex;
  const c = getCenter(current);
  let best = currentIndex;
  let bestScore = Number.POSITIVE_INFINITY;
  refs.forEach((candidate, i) => {
    if (!candidate || i === currentIndex) {
      return;
    }
    const p = getCenter(candidate);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    if (direction === "left" && dx >= -2) return;
    if (direction === "right" && dx <= 2) return;
    if (direction === "up" && dy >= -2) return;
    if (direction === "down" && dy <= 2) return;
    const primary =
      direction === "left" || direction === "right"
        ? Math.abs(dx)
        : Math.abs(dy);
    const secondary =
      direction === "left" || direction === "right"
        ? Math.abs(dy)
        : Math.abs(dx);
    const score = primary * 1000 + secondary;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
};

const LoadingGrid = ({ columns }: { columns: number }) => (
  <>
    {Array.from({ length: columns }, (_, columnIndex) => (
      <div key={columnIndex} style={{ flex: "1 1 0" }}>
        {SKELETON_HEIGHTS.map((_, rowIndex) => (
          <div
            key={rowIndex}
            className={Classes.SKELETON}
            style={{
              height:
                SKELETON_HEIGHTS[
                  (rowIndex + columnIndex) % SKELETON_HEIGHTS.length
                ],
              margin: 2,
            }}
          />
        ))}
      </div>
    ))}
  </>
);

const FooterAction = ({
  label,
  shortcut,
  primary = false,
}: {
  label: string;
  shortcut: string;
  primary?: boolean;
}) => (
  <div
    style={{
      alignItems: "center",
      color: "#182026",
      display: "flex",
      fontSize: 12,
      lineHeight: "12px",
      padding: "2px 5px",
    }}
  >
    <span style={{ fontWeight: primary ? 700 : 400, marginRight: 3 }}>
      {label}
    </span>
    <span
      style={{
        background: "rgba(0, 0, 0, 0.08)",
        borderRadius: 2,
        color: "#5c7080",
        fontSize: 10,
        lineHeight: "10px",
        padding: "1px 4px",
      }}
    >
      {shortcut}
    </span>
  </div>
);

const GiphyOverlay = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<OpenContext | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [gifs, setGifs] = useState<IGif[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const requestRef = useRef(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const columns = 4;

  const close = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  const insertGif = useCallback(
    async (gif: IGif) => {
      if (!context?.blockUid) {
        setError("No target block found for GIF insertion.");
        return;
      }
      const value = getTextByBlockUid(context.blockUid) || "";
      const position = clamp(context.insertAt, 0, value.length);
      const safeTitle = (gif.title || "gif").replace(/[\[\]()]/g, "");
      const gifMarkdown = `![${safeTitle}](${gif.images.original.url})`;
      const newValue = `${value.slice(0, position)}${gifMarkdown}${value.slice(
        position,
      )}`;
      try {
        await window.roamAlphaAPI.updateBlock({
          block: { string: newValue, uid: context.blockUid },
        });
        setIsOpen(false);
        searchInputRef.current?.blur();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      } catch (e) {
        console.error("[giphy:/gif] failed to insert gif", e);
        setError("Failed to insert GIF. Please try again.");
      }
    },
    [context],
  );

  const copySelectedGifLink = useCallback(async (gif: IGif) => {
    try {
      await copyGifLink({
        originalUrl: gif.images.original?.url,
        fallbackUrl: gif.url,
        clipboard: navigator.clipboard,
      });
    } catch (e) {
      console.error("[giphy:/gif] failed to copy gif link", e);
    }
  }, []);

  const onSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (!gifs.length) {
        return;
      }
      if (isCopyGifShortcut({ key: e.key, ctrlKey: e.ctrlKey })) {
        e.preventDefault();
        void copySelectedGifLink(gifs[selectedIndex]);
        return;
      }
      let nextIndex = selectedIndex;
      if (e.key === "ArrowRight") {
        nextIndex = getDirectionalIndex({
          currentIndex: selectedIndex,
          direction: "right",
          refs: itemRefs.current,
        });
      } else if (e.key === "ArrowLeft") {
        nextIndex = getDirectionalIndex({
          currentIndex: selectedIndex,
          direction: "left",
          refs: itemRefs.current,
        });
      } else if (e.key === "ArrowDown") {
        nextIndex = getVerticalGridIndex({
          currentIndex: selectedIndex,
          direction: "down",
          columns,
          total: gifs.length,
        });
      } else if (e.key === "ArrowUp") {
        nextIndex = getVerticalGridIndex({
          currentIndex: selectedIndex,
          direction: "up",
          columns,
          total: gifs.length,
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        void insertGif(gifs[selectedIndex]);
        return;
      } else {
        return;
      }
      e.preventDefault();
      setSelectedIndex(nextIndex);
    },
    [close, columns, copySelectedGifLink, gifs, insertGif, selectedIndex],
  );

  useEffect(() => {
    controller = {
      open: (nextContext: OpenContext) => {
        setContext(nextContext);
        setSearch("");
        setDebouncedSearch("");
        setSelectedIndex(0);
        setHoveredIndex(null);
        setError("");
        setNonce((n) => n + 1);
        setIsOpen(true);
      },
      close,
    };
    if (pendingOpen) {
      const pending = pendingOpen;
      pendingOpen = null;
      controller.open(pending);
    }
    return () => {
      if (controller?.close === close) {
        controller = null;
      }
    };
  }, [close]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const timeout = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (GIPHY_API_PAUSED) {
      setIsLoading(false);
      setGifs([]);
      setSelectedIndex(0);
      setError("GIPHY API paused due to rate limiting.");
      return;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setIsLoading(true);
    setError("");
    const load = async () => {
      try {
        const result = debouncedSearch.trim()
          ? await gf.search(debouncedSearch.trim(), { limit: 24 })
          : await gf.trending({ limit: 24 });
        if (requestRef.current !== requestId) {
          return;
        }
        setGifs(result.data || []);
        setSelectedIndex(0);
      } catch (_e) {
        if (requestRef.current !== requestId) {
          return;
        }
        setGifs([]);
        setError("Failed to load GIFs.");
      } finally {
        if (requestRef.current === requestId) {
          setIsLoading(false);
        }
      }
    };
    void load();
  }, [isOpen, nonce, debouncedSearch]);

  useEffect(() => {
    const selected = itemRefs.current[selectedIndex];
    selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedIndex, gifs]);

  const columnsData = useMemo(() => {
    const cols: Array<Array<{ gif: IGif; index: number }>> = Array.from(
      { length: columns },
      () => [],
    );
    gifs.forEach((gif, i) => {
      cols[i % columns].push({ gif, index: i });
    });
    return cols;
  }, [gifs, columns]);

  const resultState = getGiphyResultState({
    isLoading,
    error,
    resultCount: gifs.length,
  });

  return (
    <Dialog
      isOpen={isOpen}
      onClose={close}
      canEscapeKeyClose
      canOutsideClickClose
      title={"Insert GIF"}
      className={"roamjs-giphy-dialog"}
      style={{
        width: PICKER_WIDTH,
        maxWidth: "95vw",
        paddingBottom: 0,
        overflow: "hidden",
        background: "#ffffff",
        borderRadius: 8,
        boxShadow: ROAM_MODAL_SHADOW,
      }}
      autoFocus={false}
    >
      <div style={{ padding: 10, background: "#ffffff" }}>
        <InputGroup
          inputRef={(r: HTMLInputElement | null) => {
            searchInputRef.current = r;
          }}
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            e.stopPropagation();
            setSearch(e.target.value);
          }}
          onKeyUp={(e: React.KeyboardEvent<HTMLInputElement>) =>
            e.stopPropagation()
          }
          onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) =>
            e.stopPropagation()
          }
          onKeyDown={onSearchKeyDown}
          autoComplete={"off"}
          leftIcon={"search"}
          placeholder={"Search GIFs"}
        />
        <div
          data-giphy-results-state={resultState}
          style={{
            marginTop: 8,
            height: RESULT_VIEWPORT_HEIGHT,
            overflowY: "auto",
            overflowX: "hidden",
            display: "flex",
            gap: 0,
            background: "#ffffff",
          }}
        >
          {isLoading && <LoadingGrid columns={columns} />}
          {!isLoading && !!error && (
            <div
              style={{
                alignItems: "center",
                display: "flex",
                justifyContent: "center",
                width: "100%",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>{error}</span>
                <Button
                  minimal
                  small
                  text={"Retry"}
                  onClick={() => setNonce((n) => n + 1)}
                />
              </div>
            </div>
          )}
          {!isLoading && !error && !gifs.length && (
            <div
              style={{
                alignItems: "center",
                display: "flex",
                justifyContent: "center",
                width: "100%",
              }}
            >
              No GIFs found.
            </div>
          )}
          {!isLoading &&
            columnsData.map((col, colIndex) => (
              <div key={colIndex} style={{ flex: "1 1 0" }}>
                {col.map(({ gif, index: i }) => {
                  const isActive = i === selectedIndex || i === hoveredIndex;
                  const image =
                    gif.images.fixed_height?.url ||
                    gif.images.fixed_width_small?.url ||
                    gif.images.preview_gif?.url;
                  return (
                    <Button
                      key={gif.id}
                      elementRef={(r: HTMLButtonElement | null) => {
                        itemRefs.current[i] = r;
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        void insertGif(gif);
                      }}
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() =>
                        setHoveredIndex((prev) => (prev === i ? null : prev))
                      }
                      aria-label={`${gif.title || "GIF"}, result ${i + 1}`}
                      aria-pressed={i === selectedIndex}
                      data-giphy-result-index={i}
                      minimal
                      style={{
                        display: "block",
                        width: "100%",
                        position: "relative",
                        lineHeight: 0,
                        fontSize: 0,
                        padding: 0,
                        borderRadius: 0,
                        overflow: "hidden",
                        border:
                          i === selectedIndex
                            ? "4px solid #182026"
                            : "1px solid transparent",
                        background: "transparent",
                        boxShadow:
                          i === selectedIndex
                            ? "0 0 0 3px #106ba3, inset 0 0 0 2px rgba(16,107,163,0.95)"
                            : "none",
                        opacity: isActive ? 1 : 0.82,
                      }}
                    >
                      {image ? (
                        <img
                          src={image}
                          alt={gif.title || "gif"}
                          style={{
                            width: "100%",
                            height: "auto",
                            display: "block",
                            filter: isActive
                              ? "none"
                              : "saturate(0.92) brightness(0.88)",
                          }}
                        />
                      ) : (
                        <span>GIF</span>
                      )}
                    </Button>
                  );
                })}
              </div>
            ))}
        </div>
      </div>
      <div
        data-giphy-footer
        style={{
          alignItems: "center",
          background: ROAM_FOOTER_BACKGROUND,
          borderTop: `1px solid ${ROAM_FOOTER_BORDER}`,
          boxSizing: "border-box",
          display: "flex",
          height: 30,
          justifyContent: "flex-end",
          padding: "3px 8px",
        }}
      >
        <FooterAction label={"Navigate"} shortcut={"← ↑ ↓ →"} />
        <Divider style={{ height: 13 }} />
        <FooterAction label={"Copy"} shortcut={"Ctrl-C"} />
        <Divider style={{ height: 13 }} />
        <FooterAction label={"Close"} shortcut={"Esc"} />
        <Divider style={{ height: 13 }} />
        <FooterAction label={"Insert"} shortcut={"Enter"} primary />
      </div>
    </Dialog>
  );
};

export const initGiphyOverlay = (): void => {
  if (rootEl) {
    return;
  }
  rootEl = document.createElement("div");
  rootEl.className = "roamjs-giphy-overlay-root";
  document.body.appendChild(rootEl);
  ReactDOM.render(<GiphyOverlay />, rootEl);
};

export const teardownGiphyOverlay = (): void => {
  if (!rootEl) {
    pendingOpen = null;
    controller = null;
    return;
  }
  ReactDOM.unmountComponentAtNode(rootEl);
  rootEl.remove();
  rootEl = null;
  pendingOpen = null;
  controller = null;
};

export const openGiphyPicker = (context: OpenContext): void => {
  initGiphyOverlay();
  if (controller) {
    controller.open(context);
  } else {
    pendingOpen = context;
  }
};

export default GiphyOverlay;
