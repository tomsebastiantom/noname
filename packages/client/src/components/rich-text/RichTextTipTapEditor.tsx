import {
  DEFAULT_CONTENT_LOCALE,
  emptyRichTextDocument,
  parseRichTextConstraints,
  parseRichTextFieldValue,
  type RichTextDocument,
  richTextToolbarFlags,
  serializeRichTextFieldValue,
} from "@noname/documents";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaFieldLabels } from "../../admin/components/content/MediaFieldInput";
import {
  type AssetSummary,
  type ContentEntryRow,
  entryLabel,
  getContentType,
  listAssets,
  listEntries,
  uploadAsset,
} from "../../documents/content-entries";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import "./rich-text-editor.css";
import { richTextToTipTapJson, tipTapJsonToRichText } from "./tiptap-bridge";
import {
  EmbeddedAssetBlock,
  EmbeddedAssetInline,
  EmbeddedEntryBlock,
  EmbeddedEntryInline,
  EmbeddedVideoBlock,
} from "./tiptap-extensions";
import { PasteSanitize } from "./tiptap-paste-sanitize";

function parseInitialDocument(raw: string): RichTextDocument {
  if (!raw.trim()) return emptyRichTextDocument();
  return parseRichTextFieldValue(raw) ?? emptyRichTextDocument();
}

function ToolbarButton({
  active,
  onClick,
  children,
}: Readonly<{ active?: boolean; onClick: () => void; children: React.ReactNode }>) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={active ? "is-active h-8 px-2" : "h-8 px-2"}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function RichTextTipTapEditor({
  label,
  required,
  value,
  onChange,
  referenceTarget,
  mediaLabels,
  constraints,
}: Readonly<{
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  referenceTarget?: string;
  mediaLabels: MediaFieldLabels;
  constraints?: Record<string, unknown>;
}>) {
  const lastEmitted = useRef(value);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetInlinePickerOpen, setAssetInlinePickerOpen] = useState(false);
  const [entryPickerOpen, setEntryPickerOpen] = useState(false);
  const [entryInlinePickerOpen, setEntryInlinePickerOpen] = useState(false);
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [entries, setEntries] = useState<ContentEntryRow[]>([]);
  const [entryType, setEntryType] = useState(referenceTarget ?? "");
  const [entrySchema, setEntrySchema] = useState<Awaited<ReturnType<typeof getContentType>>>(null);
  const initialDoc = useMemo(() => parseInitialDocument(value), [value]);
  const toolbar = useMemo(
    () => richTextToolbarFlags(parseRichTextConstraints(constraints)),
    [constraints],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Placeholder.configure({ placeholder: "Write content… paste from web or Word is supported." }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      EmbeddedAssetBlock,
      EmbeddedEntryBlock,
      EmbeddedVideoBlock,
      EmbeddedAssetInline,
      EmbeddedEntryInline,
      PasteSanitize,
    ],
    content: richTextToTipTapJson(initialDoc),
    onUpdate: ({ editor: ed }) => {
      const doc = tipTapJsonToRichText(ed.getJSON());
      const serialized = serializeRichTextFieldValue(doc);
      lastEmitted.current = serialized;
      onChange(serialized);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(richTextToTipTapJson(parseInitialDocument(value)), {
      emitUpdate: false,
    });
  }, [editor, value]);

  useEffect(() => {
    if (!assetPickerOpen && !assetInlinePickerOpen && !videoPickerOpen) return;
    void listAssets()
      .then(setAssets)
      .catch(() => setAssets([]));
  }, [assetPickerOpen, assetInlinePickerOpen, videoPickerOpen]);

  useEffect(() => {
    if ((!entryPickerOpen && !entryInlinePickerOpen) || !entryType.trim()) return;
    void getContentType(entryType)
      .then(setEntrySchema)
      .catch(() => setEntrySchema(null));
    void listEntries(entryType)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [entryPickerOpen, entryInlinePickerOpen, entryType]);

  function insertAssetBlock(documentId: string, altText?: string) {
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: "embeddedAssetBlock",
        attrs: { documentId, altText: altText ?? "" },
      })
      .run();
    setAssetPickerOpen(false);
  }

  function insertAssetInline(documentId: string, altText?: string) {
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: "embeddedAssetInline",
        attrs: { documentId, altText: altText ?? "" },
      })
      .run();
    setAssetInlinePickerOpen(false);
  }

  function insertEntryBlock(documentId: string, contentType: string) {
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: "embeddedEntryBlock",
        attrs: { documentId, contentType },
      })
      .run();
    setEntryPickerOpen(false);
  }

  function insertEntryInline(documentId: string, contentType: string) {
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: "embeddedEntryInline",
        attrs: { documentId, contentType },
      })
      .run();
    setEntryInlinePickerOpen(false);
  }

  function insertVideo(documentId: string, caption?: string) {
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: "embeddedVideoBlock",
        attrs: { documentId, caption: caption ?? "" },
      })
      .run();
    setVideoPickerOpen(false);
  }

  function promptLink() {
    const previous = editor?.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link URL", previous ?? "https://");
    if (href === null) return;
    if (href === "") {
      editor?.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor?.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>
        {label}
        {required ? " *" : ""}
      </Label>
      <div className="rich-text-editor rounded-md border border-input bg-background">
        <div className="rich-text-toolbar flex flex-wrap gap-1 border-b border-input p-1">
          {toolbar.bold && (
            <ToolbarButton
              active={editor?.isActive("bold")}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              Bold
            </ToolbarButton>
          )}
          {toolbar.italic && (
            <ToolbarButton
              active={editor?.isActive("italic")}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              Italic
            </ToolbarButton>
          )}
          {toolbar.underline && (
            <ToolbarButton
              active={editor?.isActive("underline")}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
            >
              Underline
            </ToolbarButton>
          )}
          {toolbar.heading && (
            <ToolbarButton
              active={editor?.isActive("heading", { level: 2 })}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              H2
            </ToolbarButton>
          )}
          {toolbar.bulletList && (
            <ToolbarButton
              active={editor?.isActive("bulletList")}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              List
            </ToolbarButton>
          )}
          {toolbar.orderedList && (
            <ToolbarButton
              active={editor?.isActive("orderedList")}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              Numbered
            </ToolbarButton>
          )}
          {toolbar.blockquote && (
            <ToolbarButton
              active={editor?.isActive("blockquote")}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            >
              Quote
            </ToolbarButton>
          )}
          {toolbar.codeBlock && (
            <ToolbarButton
              active={editor?.isActive("codeBlock")}
              onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            >
              Code
            </ToolbarButton>
          )}
          {toolbar.link && <ToolbarButton onClick={promptLink}>Link</ToolbarButton>}
          {toolbar.hr && (
            <ToolbarButton onClick={() => editor?.chain().focus().setHorizontalRule().run()}>
              Rule
            </ToolbarButton>
          )}
          {toolbar.table && (
            <ToolbarButton
              onClick={() =>
                editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
              }
            >
              Table
            </ToolbarButton>
          )}
          {toolbar.assetBlock && (
            <ToolbarButton onClick={() => setAssetPickerOpen(true)}>Asset</ToolbarButton>
          )}
          {toolbar.assetInline && (
            <ToolbarButton onClick={() => setAssetInlinePickerOpen(true)}>
              Inline asset
            </ToolbarButton>
          )}
          {toolbar.entryBlock && (
            <ToolbarButton onClick={() => setEntryPickerOpen(true)}>Entry</ToolbarButton>
          )}
          {toolbar.entryInline && (
            <ToolbarButton onClick={() => setEntryInlinePickerOpen(true)}>
              Inline entry
            </ToolbarButton>
          )}
          {toolbar.videoBlock && (
            <ToolbarButton onClick={() => setVideoPickerOpen(true)}>Video</ToolbarButton>
          )}
        </div>
        <EditorContent editor={editor} />
      </div>

      {assetPickerOpen && (
        <AssetPicker
          title="Insert embedded asset block"
          mediaLabels={mediaLabels}
          assets={assets}
          onClose={() => setAssetPickerOpen(false)}
          onPick={insertAssetBlock}
        />
      )}

      {assetInlinePickerOpen && (
        <AssetPicker
          title="Insert inline asset"
          mediaLabels={mediaLabels}
          assets={assets}
          onClose={() => setAssetInlinePickerOpen(false)}
          onPick={insertAssetInline}
        />
      )}

      {videoPickerOpen && (
        <AssetPicker
          title="Insert video block"
          mediaLabels={mediaLabels}
          assets={assets}
          onClose={() => setVideoPickerOpen(false)}
          onPick={(id, name) => insertVideo(id, name)}
        />
      )}

      {entryPickerOpen && (
        <EntryPicker
          title="Insert embedded entry block"
          entryType={entryType}
          setEntryType={setEntryType}
          entries={entries}
          entrySchema={entrySchema}
          onClose={() => setEntryPickerOpen(false)}
          onPick={(id) => insertEntryBlock(id, entryType.trim() || "entry")}
        />
      )}

      {entryInlinePickerOpen && (
        <EntryPicker
          title="Insert inline entry"
          entryType={entryType}
          setEntryType={setEntryType}
          entries={entries}
          entrySchema={entrySchema}
          onClose={() => setEntryInlinePickerOpen(false)}
          onPick={(id) => insertEntryInline(id, entryType.trim() || "entry")}
        />
      )}
    </div>
  );
}

function AssetPicker({
  title,
  mediaLabels,
  assets,
  onClose,
  onPick,
}: Readonly<{
  title: string;
  mediaLabels: MediaFieldLabels;
  assets: AssetSummary[];
  onClose: () => void;
  onPick: (documentId: string, altText?: string) => void;
}>) {
  return (
    <div className="space-y-2 rounded-md border border-input bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      <input
        type="file"
        accept="image/*,video/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void uploadAsset(file).then((asset) => onPick(asset.id, asset.fileName));
        }}
      />
      <p className="text-xs text-muted-foreground">{mediaLabels.pickExistingLabel}</p>
      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {assets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => onPick(asset.id, asset.fileName)}
          >
            {asset.fileName}
          </button>
        ))}
      </div>
    </div>
  );
}

function EntryPicker({
  title,
  entryType,
  setEntryType,
  entries,
  entrySchema,
  onClose,
  onPick,
}: Readonly<{
  title: string;
  entryType: string;
  setEntryType: (value: string) => void;
  entries: ContentEntryRow[];
  entrySchema: Awaited<ReturnType<typeof getContentType>>;
  onClose: () => void;
  onPick: (documentId: string) => void;
}>) {
  return (
    <div className="space-y-2 rounded-md border border-input bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      <input
        value={entryType}
        onChange={(event) => setEntryType(event.target.value)}
        placeholder="Content type (e.g. callout)"
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => onPick(entry.id)}
          >
            {entrySchema ? entryLabel(entry, entrySchema.schema, DEFAULT_CONTENT_LOCALE) : entry.id}
          </button>
        ))}
      </div>
    </div>
  );
}
