import runExtension from "roamjs-components/util/runExtension";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import getUids from "roamjs-components/dom/getUids";
import {
  initGiphyOverlay,
  openGiphyPicker,
  teardownGiphyOverlay,
} from "./components/GiphyPopover";

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

export default runExtension(async () => {
  initGiphyOverlay();

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

  return () => {
    void slashCommand?.removeCommand?.({ label: SLASH_COMMAND_LABEL });
    teardownGiphyOverlay();
  };
});
