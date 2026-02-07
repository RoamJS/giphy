import runExtension from "roamjs-components/util/runExtension";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import getUids from "roamjs-components/dom/getUids";
import updateBlock from "roamjs-components/writes/updateBlock";
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
    callback: (...args: unknown[]) => void;
  }) => null | void;
  removeCommand?: (command: { label: string }) => void | Promise<void>;
};

const SLASH_COMMAND_LABEL = "Giphy: Insert GIF";

const removeSlashFragmentFromIndexes = (
  value: string,
  indexes: [number, number]
) => {
  const [start, end] = indexes;
  const from = Math.max(0, start - 1);
  const to = Math.min(value.length, end);
  return {
    cleaned: `${value.slice(0, from)}${value.slice(to)}`,
    insertAt: from,
  };
};

const removeSlashFragmentFromCursor = (value: string, cursor: number) => {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  const before = value.slice(0, safeCursor);
  const after = value.slice(safeCursor);
  const slashMatch = before.match(/\/[^\s/]*$/i);
  if (slashMatch) {
    const from = before.length - slashMatch[0].length;
    return {
      cleaned: `${before.slice(0, from)}${after}`,
      insertAt: from,
    };
  }
  const gifMatch = before.match(/\/gif\s*$/i);
  if (gifMatch) {
    const from = before.length - gifMatch[0].length;
    return {
      cleaned: `${before.slice(0, from)}${after}`,
      insertAt: from,
    };
  }
  return { cleaned: value, insertAt: safeCursor };
};

export default runExtension(async () => {
  initGiphyOverlay();

  const slashCommand = (
    window.roamAlphaAPI.ui as {
      slashCommand?: SlashCommandApi;
    }
  ).slashCommand;

  slashCommand?.addCommand({
    label: SLASH_COMMAND_LABEL,
    callback: (...args: unknown[]) => {
      const activeElement = document.activeElement;
      const textarea =
        activeElement instanceof HTMLTextAreaElement ? activeElement : undefined;
      const context = (args?.[0] || {}) as SlashCommandContext;
      const callbackUid = context["block-uid"];
      const activeUid = textarea ? getUids(textarea).blockUid : "";
      const targetUid = callbackUid || activeUid;
      const currentValue = textarea?.value || (targetUid ? getTextByBlockUid(targetUid) : "");
      const cursorStart = textarea?.selectionStart ?? currentValue.length;
      const hasIndexRange =
        callbackUid &&
        Array.isArray(context.indexes) &&
        context.indexes.length === 2 &&
        typeof context.indexes[0] === "number" &&
        typeof context.indexes[1] === "number";
      const { cleaned: updatedValue, insertAt } = hasIndexRange
        ? removeSlashFragmentFromIndexes(currentValue, context.indexes as [number, number])
        : removeSlashFragmentFromCursor(currentValue, cursorStart);

      if (updatedValue !== currentValue) {
        if (textarea) {
          textarea.value = updatedValue;
          textarea.selectionStart = insertAt;
          textarea.selectionEnd = insertAt;
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (targetUid) {
          window.setTimeout(() => {
            updateBlock({ uid: targetUid, text: updatedValue }).catch((e) =>
              console.error("[giphy:/gif] persisted update failed", e)
            );
          }, 0);
        }
      }

      window.setTimeout(
        () =>
          openGiphyPicker({
            blockUid: targetUid,
            insertAt,
          }),
        0
      );
    },
  });

  return () => {
    void slashCommand?.removeCommand?.({ label: SLASH_COMMAND_LABEL });
    teardownGiphyOverlay();
  };
});
