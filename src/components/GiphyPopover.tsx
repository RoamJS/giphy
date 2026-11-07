import { Button, Classes, Dialog, InputGroup } from "@blueprintjs/core";
import { GiphyFetch } from "@giphy/js-fetch-api";
import { IGif } from "@giphy/js-types";
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import {
  copyGifMarkdown,
  getCopyGifShortcutLabel,
  getGifMarkdown,
  getGiphyResultState,
  isCopyGifShortcut,
} from "./giphyPickerState";

type OpenContext = { blockUid?: string; insertAt: number };
type OverlayController = { open: (context: OpenContext) => void };
type ActionFeedback = { message: string; error?: boolean; markdown?: string };

const gf = new GiphyFetch("NUeKPL1mNJZJmI2FOP69LA6Np5hIQdXS");
const SEARCH_DELAY = 350;

let rootEl: HTMLDivElement | null = null;
let controller: OverlayController | null = null;
let pendingOpen: OpenContext | null = null;

const GiphyOverlay = (): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<OpenContext | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ query: string; gifs: IGif[] }>({
    query: "",
    gifs: [],
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [inserting, setInserting] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const insertInFlight = useRef(false);
  const searchRequest = useRef(0);
  const copyRequest = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const query = search.trim();
  const { gifs } = results;
  const activeGif = gifs[selectedIndex];
  const resultState = getGiphyResultState({
    isLoading,
    error,
    resultCount: gifs.length,
  });

  const close = useCallback((): void => {
    if (insertInFlight.current) return;
    searchRequest.current += 1;
    copyRequest.current += 1;
    setIsOpen(false);
  }, []);

  const insertGif = async (gif: IGif): Promise<void> => {
    if (isLoading || insertInFlight.current) return;
    if (!context?.blockUid) {
      setFeedback({
        message: "Open Giphy from a block to insert a GIF.",
        error: true,
      });
      return;
    }
    const markdown = getGifMarkdown({
      title: gif.title,
      originalUrl: gif.images.original?.url,
      fallbackUrl: gif.url,
    });
    if (!markdown) {
      setFeedback({
        message: "This GIF has no link. Choose another GIF.",
        error: true,
      });
      return;
    }
    insertInFlight.current = true;
    copyRequest.current += 1;
    setInserting(true);
    setFeedback(null);
    try {
      const value = getTextByBlockUid(context.blockUid) || "";
      const position = Math.max(0, Math.min(context.insertAt, value.length));
      await window.roamAlphaAPI.updateBlock({
        block: {
          string: `${value.slice(0, position)}${markdown}${value.slice(position)}`,
          uid: context.blockUid,
        },
      });
      searchRequest.current += 1;
      setIsOpen(false);
    } catch {
      setFeedback({ message: "Couldn’t insert GIF. Try again.", error: true });
    } finally {
      insertInFlight.current = false;
      setInserting(false);
    }
  };

  const copySelectedGif = async (): Promise<void> => {
    if (!activeGif || isLoading || insertInFlight.current) return;
    const request = ++copyRequest.current;
    const gif = {
      title: activeGif.title,
      originalUrl: activeGif.images.original?.url,
      fallbackUrl: activeGif.url,
    };
    try {
      const copied = await copyGifMarkdown({
        ...gif,
        clipboard: navigator.clipboard,
      });
      if (request !== copyRequest.current) return;
      setFeedback(
        copied
          ? { message: "GIF Markdown copied" }
          : {
              message: "This GIF has no link. Choose another GIF.",
              error: true,
            },
      );
    } catch {
      if (request !== copyRequest.current) return;
      setFeedback({
        message: "Clipboard unavailable. Copy the Markdown below.",
        error: true,
        markdown: getGifMarkdown(gif),
      });
    }
  };

  const onSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ): void => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (
      isCopyGifShortcut(event) &&
      event.currentTarget.selectionStart === event.currentTarget.selectionEnd
    ) {
      event.preventDefault();
      void copySelectedGif();
      return;
    }
    if (!activeGif || isLoading || inserting) return;
    if (event.key === "Enter") {
      event.preventDefault();
      void insertGif(activeGif);
      return;
    }
    if (!gridRef.current) return;
    const columns = getComputedStyle(gridRef.current).gridTemplateColumns.split(
      " ",
    ).length;
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -columns,
      ArrowDown: columns,
    };
    const offset = offsets[event.key];
    if (typeof offset !== "number") return;
    event.preventDefault();
    const nextIndex = selectedIndex + offset;
    if (nextIndex >= 0 && nextIndex < gifs.length) setSelectedIndex(nextIndex);
  };

  useEffect(() => {
    const current: OverlayController = {
      open: (nextContext) => {
        if (insertInFlight.current) return;
        searchRequest.current += 1;
        copyRequest.current += 1;
        setContext(nextContext);
        setSearch("");
        setResults({ query: "", gifs: [] });
        setSelectedIndex(0);
        setIsLoading(true);
        setError(false);
        setFeedback(null);
        setNonce((value) => value + 1);
        setIsOpen(true);
      },
    };
    controller = current;
    if (pendingOpen) {
      const pending = pendingOpen;
      pendingOpen = null;
      current.open(pending);
    }
    return () => {
      if (controller === current) controller = null;
      searchRequest.current += 1;
      copyRequest.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const request = ++searchRequest.current;
    const timer = window.setTimeout(
      async () => {
        try {
          const result = query
            ? await gf.search(query, { limit: 24 })
            : await gf.trending({ limit: 24 });
          if (request !== searchRequest.current) return;
          setResults({ query, gifs: result.data || [] });
          setSelectedIndex(0);
          if (resultsRef.current) resultsRef.current.scrollTop = 0;
        } catch {
          if (request === searchRequest.current) setError(true);
        } finally {
          if (request === searchRequest.current) setIsLoading(false);
        }
      },
      query ? SEARCH_DELAY : 0,
    );
    return () => {
      window.clearTimeout(timer);
      searchRequest.current += 1;
    };
  }, [isOpen, nonce, query]);

  useEffect(() => {
    if (!isOpen) return;
    gridRef.current?.children[selectedIndex]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [isOpen, selectedIndex, gifs]);

  useEffect(() => {
    if (!feedback || feedback.error) return;
    const timer = window.setTimeout(() => setFeedback(null), 3500);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const updateSearch = (value: string): void => {
    setSearch(value);
    if (value.trim() === query) return;
    searchRequest.current += 1;
    copyRequest.current += 1;
    setIsLoading(true);
    setError(false);
    setFeedback(null);
  };

  const retry = (): void => {
    searchInputRef.current?.focus();
    setError(false);
    setIsLoading(true);
    setNonce((value) => value + 1);
  };

  const previousResults = results.query
    ? `results for “${results.query}”`
    : "trending GIFs";
  const searchStatus = {
    loading: query ? "Searching GIFs…" : "Loading trending GIFs…",
    refreshing: `Searching… Showing ${previousResults}.`,
    stale: `Search failed. Showing ${previousResults}.`,
    error: "Couldn’t load GIFs.",
    empty: query ? "No GIFs match this search." : "No trending GIFs right now.",
    ready: query ? `${gifs.length} GIFs` : "Trending GIFs",
  }[resultState];
  const actionsDisabled = isLoading || inserting;
  const copyShortcut = getCopyGifShortcutLabel(navigator.platform);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={close}
      onOpened={() => searchInputRef.current?.focus()}
      canEscapeKeyClose={!inserting}
      canOutsideClickClose={!inserting}
      isCloseButtonShown={!inserting}
      shouldReturnFocusOnClose
      title="Insert GIF"
      className="roamjs-giphy-dialog"
    >
      <div className="roamjs-giphy-search">
        <InputGroup
          inputRef={(element) => {
            searchInputRef.current = element;
          }}
          value={search}
          onChange={(event) => updateSearch(event.target.value)}
          onKeyUp={(event) => event.stopPropagation()}
          onKeyPress={(event) => event.stopPropagation()}
          onKeyDown={onSearchKeyDown}
          autoComplete="off"
          readOnly={inserting}
          leftIcon="search"
          placeholder="Search GIFs"
          aria-label="Search GIFs"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="roamjs-giphy-grid"
          aria-activedescendant={
            activeGif && !isLoading
              ? `roamjs-giphy-option-${selectedIndex}`
              : undefined
          }
          rightElement={
            search ? (
              <Button
                minimal
                icon="cross"
                aria-label="Clear search"
                disabled={inserting}
                onClick={() => {
                  updateSearch("");
                  searchInputRef.current?.focus();
                }}
              />
            ) : undefined
          }
        />
      </div>
      <div className="roamjs-giphy-status flex items-center gap-2">
        <span role="status" title={searchStatus}>
          {searchStatus}
        </span>
        {error ? (
          <Button
            minimal
            small
            text="Retry"
            disabled={inserting}
            onClick={retry}
          />
        ) : null}
      </div>
      <div
        className="roamjs-giphy-results"
        data-giphy-results-state={resultState}
        ref={resultsRef}
      >
        <div
          className="roamjs-giphy-grid"
          id="roamjs-giphy-grid"
          ref={gridRef}
          role="listbox"
          aria-label="GIF results"
          aria-busy={isLoading}
        >
          {gifs.map((gif, index) => {
            const image =
              gif.images.fixed_height?.url ||
              gif.images.fixed_width_small?.url ||
              gif.images.preview_gif?.url;
            return (
              <Button
                key={gif.id}
                id={`roamjs-giphy-option-${index}`}
                className="roamjs-giphy-option"
                role="option"
                tabIndex={-1}
                aria-label={gif.title || `GIF ${index + 1}`}
                aria-selected={index === selectedIndex}
                data-giphy-result-index={index}
                minimal
                disabled={actionsDisabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setSelectedIndex(index);
                  void insertGif(gif);
                }}
              >
                {image ? <img src={image} alt="" /> : "GIF"}
              </Button>
            );
          })}
        </div>
        {resultState === "loading" ? (
          <div className="roamjs-giphy-grid" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                className={`roamjs-giphy-skeleton ${Classes.SKELETON}`}
              />
            ))}
          </div>
        ) : null}
      </div>
      {feedback ? (
        <div className="roamjs-giphy-feedback">
          <span role={feedback.error ? "alert" : "status"}>
            {feedback.message}
          </span>
          {feedback.markdown ? (
            <InputGroup
              readOnly
              value={feedback.markdown}
              aria-label="GIF Markdown"
              onFocus={(event) => event.currentTarget.select()}
            />
          ) : null}
        </div>
      ) : null}
      <footer
        className="roamjs-giphy-footer flex items-center gap-2"
        data-giphy-footer
      >
        <span className="roamjs-giphy-shortcuts">
          Navigate <kbd>← ↑ ↓ →</kbd>
        </span>
        <span className="roamjs-giphy-shortcuts">
          Close <kbd>Esc</kbd>
        </span>
        <span className="roamjs-giphy-shortcuts">
          Insert <kbd>Enter</kbd>
        </span>
        <span className="roamjs-giphy-inserting" role="status">
          {inserting ? "Inserting GIF…" : ""}
        </span>
        <Button
          className="roamjs-giphy-copy"
          minimal
          small
          icon="duplicate"
          text={
            <span>
              Copy GIF <kbd>{copyShortcut}</kbd>
            </span>
          }
          aria-label="Copy GIF Markdown"
          disabled={!activeGif || actionsDisabled}
          onClick={() => void copySelectedGif()}
        />
      </footer>
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
