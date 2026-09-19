import TipTapEditor from "@/components/editor/TipTapEditor";

/**
 * Email/template WYSIWYG editor. Now powered by TipTap (ProseMirror). Emits raw
 * HTML via onChange so the authored design is exactly what gets sent (wrapped
 * server-side in a responsive email skeleton). Table/embed/code are disabled as
 * they are unsafe/unsupported in most email clients; images use a URL prompt.
 */
export default function RichTextEditor({ value, onChange, placeholder = "Write your email\u2026" }) {
  return (
    <TipTapEditor
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      minHeight={240}
      testId="rte"
      containerTestId="rich-editor"
      bodyClass="rte-body"
      imageSource="prompt"
      features={{ table: false, embed: false, code: false, hr: false }}
    />
  );
}
