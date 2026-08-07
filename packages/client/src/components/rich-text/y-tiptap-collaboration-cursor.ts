import { Extension } from "@tiptap/core";
import { defaultSelectionBuilder, yCursorPlugin } from "@tiptap/y-tiptap";
import type { Awareness } from "y-protocols/awareness";

/** Remote cursors — must use @tiptap/y-tiptap (same ySyncPluginKey as Collaboration). */
export const YTiptapCollaborationCursor = Extension.create({
  name: "collaborationCursor",
  addOptions() {
    return {
      awareness: null as Awareness | null,
      user: { name: "Editor", color: "#ffa500" },
      render: (user: { name: string; color: string }) => {
        const cursor = document.createElement("span");
        cursor.classList.add("collaboration-cursor__caret");
        cursor.setAttribute("style", `border-color: ${user.color}`);
        const label = document.createElement("div");
        label.classList.add("collaboration-cursor__label");
        label.setAttribute("style", `background-color: ${user.color}`);
        label.insertBefore(document.createTextNode(user.name), null);
        cursor.insertBefore(label, null);
        return cursor;
      },
      selectionRender: defaultSelectionBuilder,
    };
  },
  addProseMirrorPlugins() {
    const awareness = this.options.awareness;
    if (!awareness) return [];
    awareness.setLocalStateField("user", this.options.user);
    return [
      yCursorPlugin(awareness, {
        cursorBuilder: this.options.render,
        selectionBuilder: this.options.selectionRender,
      }),
    ];
  },
});
