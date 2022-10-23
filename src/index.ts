import runExtension from "roamjs-components/util/runExtension";
import createHTMLObserver from "roamjs-components/dom/createHTMLObserver";
import { render } from "./components/GiphyPopover";

export default runExtension({
  run: () => {
    // no settings yet
    // args.extensionAPI.settings.panel.create({
    //   tabTitle: "giphy",
    //   settings: [],
    // });

    createHTMLObserver({
      tag: "TEXTAREA",
      className: "rm-block-input",
      callback: (t: HTMLTextAreaElement) => {
        render(t);
      },
      removeCallback: () =>
        Array.from(
          document.getElementsByClassName("roamjs-giphy-portal")
        ).forEach((p) =>
          p.parentElement.parentElement.removeChild(p.parentElement)
        ),
    });
  },
});
