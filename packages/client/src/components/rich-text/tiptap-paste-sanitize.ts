import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

/** Strip scripts/styles from pasted HTML before TipTap schema normalization. */
export const PasteSanitize = Extension.create({
  name: "pasteSanitize",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPastedHTML(html) {
            return html
              .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
              .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
              .replace(/\son\w+="[^"]*"/gi, "")
              .replace(/\son\w+='[^']*'/gi, "");
          },
        },
      }),
    ];
  },
});
