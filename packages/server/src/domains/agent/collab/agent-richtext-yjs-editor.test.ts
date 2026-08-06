import { plainTextToRichTextDocument, richTextToPlainText } from "@noname/documents";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { AgentRichTextYjsEditor } from "./agent-richtext-yjs-editor";

describe("AgentRichTextYjsEditor", () => {
  it("writes RichTextDocument into a shared Y.Doc for other peers", () => {
    const ydoc = new Y.Doc();
    const agentEditor = new AgentRichTextYjsEditor();
    const peerEditor = new AgentRichTextYjsEditor();

    agentEditor.bind(ydoc);
    peerEditor.bind(ydoc);

    agentEditor.applyDocument(plainTextToRichTextDocument("Agent live merge"));

    expect(richTextToPlainText(peerEditor.currentDocument())).toBe("Agent live merge");

    agentEditor.destroy();
    peerEditor.destroy();
    ydoc.destroy();
  });
});
