import {
  type RichTextDocument,
  richTextToTipTapJson,
  tipTapJsonToRichText,
} from "@noname/documents";
import { type Extensions, getSchema } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from "@tiptap/y-tiptap";
import type * as awarenessProtocol from "y-protocols/awareness";
import type * as Y from "yjs";
import { agentRichTextEmbedExtensions } from "./richtext-tiptap-extensions";

/** Yjs collaboration field TipTap's Collaboration extension defaults to (`ydoc.getXmlFragment("default")`). */
const COLLAB_FIELD = "default";

/**
 * Same node/mark set the browser editor renders (StarterKit + table/link/underline +
 * embed extensions) — everything except `Collaboration`/`CollaborationCursor`, which are
 * ProseMirror-view plugins with nothing to attach to here; there is no `EditorView`.
 */
const AGENT_RICHTEXT_EXTENSIONS: Extensions = [
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
];

/** Built once — pure function of the fixed extension set above, not of any document/session. */
const richTextSchema = getSchema(AGENT_RICHTEXT_EXTENSIONS);

/**
 * Headless Yjs<->rich-text bridge for the AI agent, operating directly on the ProseMirror
 * document model via `@tiptap/y-tiptap`'s low-level Yjs<->ProseMirror conversion functions
 * (the same functions `ySyncPlugin` uses internally to apply transactions) — no TipTap
 * `Editor`/`EditorView` and no DOM shim. This works because Yjs collaboration syncs the
 * document model (a Y.XmlFragment), not a rendered view; nothing here is ever displayed.
 */
export class AgentRichTextYjsEditor {
  private fragment: Y.XmlFragment | null = null;

  bind(
    ydoc: Y.Doc,
    collab?: {
      awareness: awarenessProtocol.Awareness;
      user: { name: string; color: string };
    },
  ): void {
    this.fragment = ydoc.getXmlFragment(COLLAB_FIELD);
    // Presence only — no ProseMirror view/cursor plugin exists here to render into.
    collab?.awareness.setLocalStateField("user", collab.user);
  }

  applyDocument(doc: RichTextDocument): void {
    const fragment = this.fragment;
    if (!fragment) {
      throw new Error("Rich text Yjs editor not bound");
    }
    // Diffs the given ProseMirror JSON against the fragment's current content in place —
    // the same `updateYFragment` mechanism `ySyncPlugin` runs per keystroke, so this is a
    // safe incremental write against an already-shared Y.Doc, not a destructive re-import.
    prosemirrorJSONToYXmlFragment(richTextSchema, richTextToTipTapJson(doc), fragment);
  }

  currentDocument(): RichTextDocument {
    const fragment = this.fragment;
    if (!fragment) {
      throw new Error("Rich text Yjs editor not bound");
    }
    return tipTapJsonToRichText(
      yXmlFragmentToProseMirrorRootNode(fragment, richTextSchema).toJSON(),
    );
  }

  destroy(): void {
    this.fragment = null;
  }
}
