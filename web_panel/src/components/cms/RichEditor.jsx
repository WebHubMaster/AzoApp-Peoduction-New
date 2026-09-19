import TipTapEditor from "@/components/editor/TipTapEditor";

/**
 * CMS rich-text editor. Now powered by TipTap (ProseMirror) for reliable,
 * clean-HTML editing. Public contract is unchanged (value / onChange emit HTML,
 * sanitized server-side via bleach). Images are inserted via the Media Library.
 */
export default function RichEditor({ value, onChange, placeholder = "Start writing\u2026", minHeight = 320, testId = "rich-editor" }) {
  return (
    <TipTapEditor
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      minHeight={minHeight}
      testId={testId}
      bodyClass="rt-editor"
      imageSource="media"
      mediaFolder="cms"
    />
  );
}
