import {
  Button,
  Card,
  Dialog,
  Elevation,
  InputGroup,
  Spinner,
} from "@blueprintjs/core";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { GiphyFetch } from "@giphy/js-fetch-api";
import { IGif } from "@giphy/js-types";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";

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
    const primary = direction === "left" || direction === "right" ? Math.abs(dx) : Math.abs(dy);
    const secondary = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    const score = primary * 1000 + secondary;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
};

const GiphyOverlay = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<OpenContext | null>(null);
  const [search, setSearch] = useState("");
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
      const gifMarkdown = `![${gif.title}](${gif.images.original.url})`;
      const newValue = `${value.slice(0, position)}${gifMarkdown}${value.slice(
        position
      )}`;
      await window.roamAlphaAPI.updateBlock({
        block: { string: newValue, uid: context.blockUid },
      });
      setIsOpen(false);
      searchInputRef.current?.blur();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
    [context]
  );

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
    [close, columns, gifs, insertGif, selectedIndex]
  );

  useEffect(() => {
    controller = {
      open: (nextContext: OpenContext) => {
        setContext(nextContext);
        setSearch("");
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
        const result = search.trim()
          ? await gf.search(search.trim(), { limit: 24 })
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
  }, [isOpen, nonce, search]);

  useEffect(() => {
    const selected = itemRefs.current[selectedIndex];
    selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedIndex, gifs]);

  const columnsData = useMemo(() => {
    const cols: Array<Array<{ gif: IGif; index: number }>> = Array.from(
      { length: columns },
      () => []
    );
    gifs.forEach((gif, i) => {
      cols[i % columns].push({ gif, index: i });
    });
    return cols;
  }, [gifs, columns]);

  const pickerWidth = useMemo(() => 1400, []);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={close}
      canEscapeKeyClose
      canOutsideClickClose
      title={"Insert GIF"}
      style={{ width: pickerWidth, maxWidth: "95vw" }}
      autoFocus={false}
    >
      <div style={{ padding: 10 }}>
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
          style={{
            marginTop: 8,
            maxHeight: 720,
            overflowY: "auto",
            overflowX: "hidden",
            display: "flex",
            gap: 0,
          }}
        >
          {isLoading && (
            <Card elevation={Elevation.ZERO}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 120,
                }}
              >
                <Spinner size={24} />
              </div>
            </Card>
          )}
          {!isLoading && !!error && (
            <Card elevation={Elevation.ZERO}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{error}</span>
                <Button
                  minimal
                  small
                  text={"Retry"}
                  onClick={() => setNonce((n) => n + 1)}
                />
              </div>
            </Card>
          )}
          {!isLoading && !error && !gifs.length && (
            <Card elevation={Elevation.ZERO}>
              No GIFs found.
            </Card>
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
                            filter:
                              isActive
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
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "#5c7080",
          }}
        >
          Arrow keys navigate, Enter inserts, Esc closes.
        </div>
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
