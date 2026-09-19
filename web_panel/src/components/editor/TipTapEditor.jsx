import React, { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote, Minus,
  Link2, Unlink, Image as ImageIcon, Table as TableIcon, Code, Undo, Redo,
  RemoveFormatting, Maximize2, Minimize2, Eye, Type, AlignLeft, AlignCenter,
  AlignRight, Highlighter, Palette,
} from "lucide-react";
import PremiumSelect from "@/components/ui/PremiumSelect";
import MediaLibraryPicker from "@/components/cms/MediaLibraryPicker";

/**
 * TipTap (ProseMirror) powered rich-text editor. Replaces the legacy
 * contentEditable + document.execCommand implementation which was deprecated and
 * unreliable (commands no-op'd on lost selection, colour/highlight silently
 * failed, and lists produced invalid <p><ul></ul></p> markup).
 *
 * Reliable, clean-HTML output. Same public contract as before:
 *   value (HTML string) / onChange(html). Emits HTML via getHTML().
 */

// Minimal responsive iframe node so the "embed" button (YouTube / Vimeo / Maps)
// keeps working and round-trips through save.
const Iframe = Node.create({
  name: "iframe",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: null },
      style: { default: "width:100%;aspect-ratio:16/9;border:0;border-radius:8px;" },
    };
  },
  parseHTML() {
    return [{ tag: "iframe" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { class: "tt-embed" },
      ["iframe", mergeAttributes(HTMLAttributes, { allowfullscreen: "true", frameborder: "0", title: "embed" })],
    ];
  },
});

const Btn = ({ icon: I, onClick, title, active }) => (
  <button type="button" title={title} data-testid={`toolbar-btn-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 ${active ? "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300" : ""}`}>
    <I className="h-4 w-4" />
  </button>
);
const Div = () => <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />;

export default function TipTapEditor({
  value,
  onChange,
  placeholder = "Start writing…",
  minHeight = 320,
  testId = "rich-editor",
  containerTestId,
  bodyClass = "rt-editor",
  imageSource = "prompt", // "prompt" | "media"
  mediaFolder = "cms",
  features = {}, // { table, embed, code, color, image, align } — all on by default
}) {
  const f = {
    heading: true, color: true, align: true, lists: true, quote: true, hr: true,
    link: true, image: true, table: true, embed: true, code: true, ...features,
  };

  const [fullscreen, setFullscreen] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [counts, setCounts] = useState({ words: 0, chars: 0 });
  const lastHtml = useRef(value || "");
  const [, forceTick] = useState(0);

  const recount = useCallback((editor) => {
    if (!editor) return;
    const text = (editor.getText() || "").trim();
    setCounts({ words: text ? text.split(/\s+/).length : 0, chars: text.length });
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: false, allowBase64: true, HTMLAttributes: { style: "max-width:100%;height:auto;" } }),
      Table.configure({ resizable: true, HTMLAttributes: { class: "tt-table" } }),
      TableRow,
      TableHeader,
      TableCell,
      Iframe,
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: `${bodyClass} prose prose-slate max-w-none px-4 py-3 text-[15px] text-slate-700 dark:text-slate-200 focus:outline-none`,
        "data-testid": `${testId}-area`,
        "data-placeholder": placeholder,
      },
    },
    onCreate: ({ editor }) => recount(editor),
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? "" : editor.getHTML();
      lastHtml.current = html;
      recount(editor);
      onChange?.(html);
    },
  });

  // Re-render the toolbar so active states (bold/heading/align…) stay in sync.
  useEffect(() => {
    if (!editor) return undefined;
    const cb = () => forceTick((t) => t + 1);
    editor.on("transaction", cb);
    return () => { editor.off("transaction", cb); };
  }, [editor]);

  // Sync external value changes (e.g. switching CMS pages / opening a template)
  // without clobbering what the user is actively typing.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const incoming = value || "";
    if (incoming === lastHtml.current) return;
    if (editor.isFocused) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (incoming === current) return;
    lastHtml.current = incoming;
    editor.commands.setContent(incoming, { emitUpdate: false });
    recount(editor);
  }, [value, editor, recount]);

  if (!editor) return <div className="border border-slate-200 rounded-xl p-4 text-sm text-slate-400">Loading editor…</div>;

  const run = (fn) => { fn(editor.chain().focus()).run(); };

  const setBlock = (v) => {
    if (v === "p") run((c) => c.setParagraph());
    else run((c) => c.toggleHeading({ level: Number(v.replace("h", "")) }));
  };
  const currentBlock = () => {
    for (let l = 1; l <= 6; l++) if (editor.isActive("heading", { level: l })) return `h${l}`;
    return "p";
  };

  const addLink = () => {
    const prev = editor.getAttributes("link")?.href || "";
    const url = window.prompt("Link URL (https://…)", prev);
    if (url === null) return;
    if (url === "") { run((c) => c.extendMarkRange("link").unsetLink()); return; }
    run((c) => c.extendMarkRange("link").setLink({ href: url }));
  };

  const insertImageUrl = (url, alt = "") => {
    if (!url) return;
    run((c) => c.setImage({ src: url, alt }));
  };
  const onImageBtn = () => {
    if (imageSource === "media") { setMediaOpen(true); return; }
    const url = window.prompt("Image URL");
    if (!url) return;
    const alt = window.prompt("Image alt text (SEO / accessibility)", "") || "";
    insertImageUrl(url, alt);
  };

  const insertTable = () => {
    const r = parseInt(window.prompt("Rows", "2") || "0", 10);
    const c = parseInt(window.prompt("Columns", "2") || "0", 10);
    if (!r || !c) return;
    run((ch) => ch.insertTable({ rows: r, cols: c, withHeaderRow: true }));
  };

  const insertEmbed = () => {
    const url = window.prompt("Video / embed URL (YouTube, Vimeo, Google Maps)");
    if (!url) return;
    let src = url;
    const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]+)/);
    if (yt) src = `https://www.youtube.com/embed/${yt[1]}`;
    run((c) => c.insertContent({ type: "iframe", attrs: { src } }));
  };

  const shell = fullscreen ? "fixed inset-0 z-[70] bg-white dark:bg-slate-900 p-4 flex flex-col" : "";

  return (
    <div className={shell}>
      <div className={`border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900 flex flex-col ${fullscreen ? "flex-1" : ""}`} data-testid={containerTestId || testId}>
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5">
          {f.heading && (
            <>
              <PremiumSelect value={currentBlock()} onChange={(e) => setBlock(e.target.value)} searchable={false}
                data-testid={`${testId}-format`} title="Text style" className="!h-8 !w-auto min-w-[130px] text-xs rounded-md">
                <option value="p">Paragraph</option>
                <option value="h1">Heading 1</option><option value="h2">Heading 2</option>
                <option value="h3">Heading 3</option><option value="h4">Heading 4</option>
                <option value="h5">Heading 5</option><option value="h6">Heading 6</option>
              </PremiumSelect>
              <Div />
            </>
          )}
          <Btn icon={Bold} title="Bold" active={editor.isActive("bold")} onClick={() => run((c) => c.toggleBold())} />
          <Btn icon={Italic} title="Italic" active={editor.isActive("italic")} onClick={() => run((c) => c.toggleItalic())} />
          <Btn icon={Underline} title="Underline" active={editor.isActive("underline")} onClick={() => run((c) => c.toggleUnderline())} />
          <Btn icon={Strikethrough} title="Strikethrough" active={editor.isActive("strike")} onClick={() => run((c) => c.toggleStrike())} />
          {f.color && (
            <>
              <label className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-slate-600 dark:text-slate-300" title="Text colour">
                <Palette className="h-4 w-4" />
                <input type="color" className="sr-only" onChange={(e) => run((c) => c.setColor(e.target.value))} />
              </label>
              <label className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-slate-600 dark:text-slate-300" title="Highlight">
                <Highlighter className="h-4 w-4" />
                <input type="color" className="sr-only" defaultValue="#fde68a" onChange={(e) => run((c) => c.toggleHighlight({ color: e.target.value }))} />
              </label>
            </>
          )}
          {f.align && (
            <>
              <Div />
              <Btn icon={AlignLeft} title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => run((c) => c.setTextAlign("left"))} />
              <Btn icon={AlignCenter} title="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => run((c) => c.setTextAlign("center"))} />
              <Btn icon={AlignRight} title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => run((c) => c.setTextAlign("right"))} />
            </>
          )}
          {f.lists && (
            <>
              <Div />
              <Btn icon={List} title="Bullet list" active={editor.isActive("bulletList")} onClick={() => run((c) => c.toggleBulletList())} />
              <Btn icon={ListOrdered} title="Numbered list" active={editor.isActive("orderedList")} onClick={() => run((c) => c.toggleOrderedList())} />
            </>
          )}
          {f.quote && <Btn icon={Quote} title="Quote" active={editor.isActive("blockquote")} onClick={() => run((c) => c.toggleBlockquote())} />}
          {f.hr && <Btn icon={Minus} title="Divider" onClick={() => run((c) => c.setHorizontalRule())} />}
          <Div />
          {f.link && (
            <>
              <Btn icon={Link2} title="Insert link" active={editor.isActive("link")} onClick={addLink} />
              <Btn icon={Unlink} title="Remove link" onClick={() => run((c) => c.unsetLink())} />
            </>
          )}
          {f.image && <Btn icon={ImageIcon} title="Insert image" onClick={onImageBtn} />}
          {f.table && <Btn icon={TableIcon} title="Insert table" onClick={insertTable} />}
          {f.embed && <Btn icon={Type} title="Embed video / map" onClick={insertEmbed} />}
          {f.code && <Btn icon={Code} title="Code block" active={editor.isActive("codeBlock")} onClick={() => run((c) => c.toggleCodeBlock())} />}
          <Div />
          <Btn icon={Undo} title="Undo" onClick={() => run((c) => c.undo())} />
          <Btn icon={Redo} title="Redo" onClick={() => run((c) => c.redo())} />
          <Btn icon={RemoveFormatting} title="Clear formatting" onClick={() => run((c) => c.unsetAllMarks().clearNodes())} />
          <div className="ml-auto flex items-center gap-0.5">
            <Btn icon={Eye} title="HTML source" active={showSource} onClick={() => setShowSource((s) => !s)} />
            <Btn icon={fullscreen ? Minimize2 : Maximize2} title="Fullscreen" onClick={() => setFullscreen((v) => !v)} />
          </div>
        </div>

        {/* editor / source */}
        {showSource ? (
          <textarea value={value || ""} spellCheck={false} data-testid={`${testId}-source-area`}
            onChange={(e) => { lastHtml.current = e.target.value; onChange?.(e.target.value); }}
            className="w-full font-mono text-xs p-3 text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 focus:outline-none resize-y"
            style={{ minHeight: fullscreen ? "60vh" : minHeight }} />
        ) : (
          <div className="overflow-y-auto" style={{ minHeight: fullscreen ? "60vh" : minHeight, maxHeight: fullscreen ? "none" : minHeight * 1.6 }}>
            <EditorContent editor={editor} />
          </div>
        )}

        {/* footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-400">
          <span>{showSource ? "HTML source mode — edit raw HTML" : "Rich text"}</span>
          <span data-testid={`${testId}-count`}>{counts.words} words · {counts.chars} chars</span>
        </div>
      </div>

      {imageSource === "media" && (
        <MediaLibraryPicker open={mediaOpen} onClose={() => setMediaOpen(false)}
          onSelect={(url) => { const alt = window.prompt("Image alt text (SEO / accessibility)", "") || ""; insertImageUrl(url, alt); }}
          folder={mediaFolder} />
      )}
    </div>
  );
}
