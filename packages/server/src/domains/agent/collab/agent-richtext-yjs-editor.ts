import {
  type RichTextDocument,
  richTextToTipTapJson,
  tipTapJsonToRichText,
} from "@noname/documents";
import { Editor } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { Window } from "happy-dom";
import type * as awarenessProtocol from "y-protocols/awareness";
import type * as Y from "yjs";
import { agentRichTextEmbedExtensions } from "./richtext-tiptap-extensions";

let domElement: HTMLElement | null = null;

function editorElement(): HTMLElement {
  if (domElement) return domElement;
  const window = new Window({ url: "https://localhost" });
  const globalRecord = globalThis as typeof globalThis & {
    window?: Window;
    document?: Document;
    navigator?: Navigator;
    HTMLElement?: typeof HTMLElement;
    getComputedStyle?: typeof getComputedStyle;
  };
  globalRecord.window = window as unknown as Window & typeof globalThis.window;
  globalRecord.document = window.document;
  globalRecord.HTMLElement = window.HTMLElement;
  globalRecord.getComputedStyle = window.getComputedStyle.bind(window);
  domElement = window.document.createElement("div");
  return domElement;
}

/** Headless TipTap editor bound to a shared Y.Doc — mirrors browser rich-text collab schema. */
export class AgentRichTextYjsEditor {
  private editor: Editor | null = null;

  bind(
    ydoc: Y.Doc,
    collab?: {
      awareness: awarenessProtocol.Awareness;
      user: { name: string; color: string };
    },
  ): void {
    this.destroy();
    const extensions = [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        undoRedo: false,
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      ...agentRichTextEmbedExtensions,
      Collaboration.configure({ document: ydoc }),
    ];
    if (collab) {
      extensions.push(
        CollaborationCursor.configure({
          provider: { awareness: collab.awareness },
          user: collab.user,
        }),
      );
    }
    this.editor = new Editor({
      element: editorElement(),
      extensions,
    });
  }

  applyDocument(doc: RichTextDocument): void {
    const editor = this.editor;
    if (!editor) {
      throw new Error("Rich text Yjs editor not bound");
    }
    editor.commands.setContent(richTextToTipTapJson(doc), { emitUpdate: true });
  }

  currentDocument(): RichTextDocument {
    const editor = this.editor;
    if (!editor) {
      throw new Error("Rich text Yjs editor not bound");
    }
    return tipTapJsonToRichText(editor.getJSON());
  }

  destroy(): void {
    this.editor?.destroy();
    this.editor = null;
  }
}
