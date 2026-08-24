import runExtension from "roamjs-components/util/runExtension";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import getUids from "roamjs-components/dom/getUids";
import {
  initGiphyOverlay,
  openGiphyPicker,
  teardownGiphyOverlay,
} from "./components/GiphyPopover";
import {
  GiphyPickerContext,
  resolveCommandPaletteContext,
} from "./components/giphyPickerState";

type SlashCommandContext = {
  "block-uid"?: string;
  indexes?: [number, number];
};

type SlashCommandApi = {
  addCommand: (command: {
    label: string;
    callback: (...args: unknown[]) => string | null | void;
  }) => null | void;
  removeCommand?: (command: { label: string }) => void | Promise<void>;
};

const SLASH_COMMAND_LABEL = "Giphy: Insert GIF";
const COMMAND_PALETTE_LABEL = "Giphy: Insert GIF";

export default runExtension(async ({ extensionAPI }) => {
  initGiphyOverlay();

  let lastBlockContext: GiphyPickerContext | null = null;
  const captureFocusedBlockContext = () => {
    const activeElement = document.activeElement;
    if (
      !(activeElement instanceof HTMLTextAreaElement) ||
      !activeElement.classList.contains("rm-block-input")
    ) {
      return;
    }
    const blockUid = getUids(activeElement).blockUid;
    if (blockUid) {
      lastBlockContext = {
        blockUid,
        insertAt: activeElement.selectionStart,
      };
    }
  };
  document.addEventListener("focusin", captureFocusedBlockContext);
  document.addEventListener("selectionchange", captureFocusedBlockContext);
  document.addEventListener("keydown", captureFocusedBlockContext, true);
  captureFocusedBlockContext();

  const slashCallback = (...args: unknown[]): string => {
    const activeElement = document.activeElement;
    const textarea =
      activeElement instanceof HTMLTextAreaElement ? activeElement : undefined;
    const context = (args?.[0] || {}) as SlashCommandContext;
    const callbackUid = context["block-uid"];
    const activeUid = textarea ? getUids(textarea).blockUid : "";
    const focusedUid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"] || "";
    const targetUid = callbackUid || activeUid || focusedUid;
    const hasIndexRange =
      Array.isArray(context.indexes) &&
      context.indexes.length === 2 &&
      typeof context.indexes[0] === "number" &&
      typeof context.indexes[1] === "number";
    const insertAt = hasIndexRange
      ? Math.max(0, context.indexes![0] - 1)
      : (textarea?.selectionStart ??
        (targetUid ? (getTextByBlockUid(targetUid) || "").length : 0));

    window.setTimeout(
      () =>
        openGiphyPicker({
          blockUid: targetUid,
          insertAt,
        }),
      0,
    );
    return "";
  };
  // TODO update roamjs-components to use the new slashCommand API
  const slashCommand = (
    window.roamAlphaAPI.ui as {
      slashCommand?: SlashCommandApi;
    }
  ).slashCommand;
  try {
    slashCommand?.addCommand({
      label: SLASH_COMMAND_LABEL,
      callback: slashCallback,
    });
  } catch (e) {
    console.error("[giphy:/gif] slash command registration threw", e);
  }

  await extensionAPI.ui.commandPalette.addCommand({
    label: COMMAND_PALETTE_LABEL,
    callback: () => {
      const focusedBlockUid =
        window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"] || "";
      const context = resolveCommandPaletteContext({
        focusedBlockUid,
        focusedBlockText: focusedBlockUid
          ? getTextByBlockUid(focusedBlockUid) || ""
          : "",
        lastBlockContext,
      });
      window.setTimeout(() => openGiphyPicker(context), 0);
    },
  });

  return () => {
    void slashCommand?.removeCommand?.({ label: SLASH_COMMAND_LABEL });
    void extensionAPI.ui.commandPalette.removeCommand({
      label: COMMAND_PALETTE_LABEL,
    });
    document.removeEventListener("focusin", captureFocusedBlockContext);
    document.removeEventListener("selectionchange", captureFocusedBlockContext);
    document.removeEventListener("keydown", captureFocusedBlockContext, true);
    teardownGiphyOverlay();
  };
});
