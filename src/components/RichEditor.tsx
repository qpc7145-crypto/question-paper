"use client";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { useState } from "react";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Heading2, Heading3, Italic, List, ListOrdered, Minus,
  Quote, Redo2, Sigma, Strikethrough, Subscript as SubIcon, Superscript as SupIcon, Table as TableIcon, Underline as UIcon, Undo2,
} from "lucide-react";

// Academic / mathematical symbols for question papers.
const SYMBOLS = [
  "α", "β", "γ", "δ", "ε", "θ", "λ", "μ", "π", "σ", "φ", "ω", "Δ", "Σ", "Ω",
  "±", "×", "÷", "≠", "≈", "≤", "≥", "∞", "√", "∛", "∑", "∏", "∫", "∮", "∂",
  "∇", "∈", "∉", "⊂", "⊆", "∪", "∩", "∅", "∀", "∃", "¬", "∧", "∨", "⇒", "⇔",
  "→", "←", "↔", "°", "′", "″", "‰", "ℝ", "ℕ", "ℤ", "ℚ", "ℂ", "½", "⅓", "¼",
];

function Btn({ on, active, label, children, disabled }: { on: () => void; active?: boolean; label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`rounded p-1.5 transition-all duration-150 disabled:opacity-40 ${active ? "bg-[#DBEAFE] text-[#1D4ED8]" : "text-[#475569] hover:bg-[#F1F5F9] hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [sym, setSym] = useState(false);
  const c = () => editor.chain().focus();
  const i = "h-4 w-4";
  return (
    <div className="relative flex flex-wrap items-center gap-0.5 border-b border-line bg-[#F8FAFC] px-2 py-1.5">
      <Btn label="Undo" on={() => c().undo().run()} disabled={!editor.can().undo()}><Undo2 className={i} /></Btn>
      <Btn label="Redo" on={() => c().redo().run()} disabled={!editor.can().redo()}><Redo2 className={i} /></Btn>
      <span className="mx-1 h-5 w-px bg-line" />
      <Btn label="Heading" active={editor.isActive("heading", { level: 2 })} on={() => c().toggleHeading({ level: 2 }).run()}><Heading2 className={i} /></Btn>
      <Btn label="Sub-heading" active={editor.isActive("heading", { level: 3 })} on={() => c().toggleHeading({ level: 3 }).run()}><Heading3 className={i} /></Btn>
      <Btn label="Bold" active={editor.isActive("bold")} on={() => c().toggleBold().run()}><Bold className={i} /></Btn>
      <Btn label="Italic" active={editor.isActive("italic")} on={() => c().toggleItalic().run()}><Italic className={i} /></Btn>
      <Btn label="Underline" active={editor.isActive("underline")} on={() => c().toggleUnderline().run()}><UIcon className={i} /></Btn>
      <Btn label="Strikethrough" active={editor.isActive("strike")} on={() => c().toggleStrike().run()}><Strikethrough className={i} /></Btn>
      <Btn label="Subscript" active={editor.isActive("subscript")} on={() => c().toggleSubscript().run()}><SubIcon className={i} /></Btn>
      <Btn label="Superscript" active={editor.isActive("superscript")} on={() => c().toggleSuperscript().run()}><SupIcon className={i} /></Btn>
      <span className="mx-1 h-5 w-px bg-line" />
      <Btn label="Bullet list" active={editor.isActive("bulletList")} on={() => c().toggleBulletList().run()}><List className={i} /></Btn>
      <Btn label="Numbered list" active={editor.isActive("orderedList")} on={() => c().toggleOrderedList().run()}><ListOrdered className={i} /></Btn>
      <Btn label="Quote" active={editor.isActive("blockquote")} on={() => c().toggleBlockquote().run()}><Quote className={i} /></Btn>
      <Btn label="Divider" on={() => c().setHorizontalRule().run()}><Minus className={i} /></Btn>
      <span className="mx-1 h-5 w-px bg-line" />
      <Btn label="Align left" active={editor.isActive({ textAlign: "left" })} on={() => c().setTextAlign("left").run()}><AlignLeft className={i} /></Btn>
      <Btn label="Align centre" active={editor.isActive({ textAlign: "center" })} on={() => c().setTextAlign("center").run()}><AlignCenter className={i} /></Btn>
      <Btn label="Align right" active={editor.isActive({ textAlign: "right" })} on={() => c().setTextAlign("right").run()}><AlignRight className={i} /></Btn>
      <Btn label="Justify" active={editor.isActive({ textAlign: "justify" })} on={() => c().setTextAlign("justify").run()}><AlignJustify className={i} /></Btn>
      <span className="mx-1 h-5 w-px bg-line" />
      <Btn label="Insert table" on={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className={i} /></Btn>
      {editor.isActive("table") && (
        <span className="flex items-center gap-1 text-xs">
          <button type="button" className="rounded px-1.5 py-1 text-muted hover:bg-[#F1F5F9]" onClick={() => c().addRowAfter().run()}>+ row</button>
          <button type="button" className="rounded px-1.5 py-1 text-muted hover:bg-[#F1F5F9]" onClick={() => c().addColumnAfter().run()}>+ col</button>
          <button type="button" className="rounded px-1.5 py-1 text-red-600 hover:bg-red-50" onClick={() => c().deleteTable().run()}>delete table</button>
        </span>
      )}
      <Btn label="Insert symbol" active={sym} on={() => setSym((s) => !s)}><Sigma className={i} /></Btn>
      {sym && (
        <div className="absolute left-2 right-2 top-full z-20 mt-1 grid grid-cols-10 gap-1 rounded-md border border-line bg-white p-2 shadow-lg sm:left-auto sm:w-80 sm:grid-cols-12">
          {SYMBOLS.map((s) => (
            <button key={s} type="button" className="rounded py-1 text-base hover:bg-[#DBEAFE]" onMouseDown={(e) => e.preventDefault()} onClick={() => c().insertContent(s).run()}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RichEditor({ value, onChange, editable = true, placeholder }: { value: string; onChange?: (html: string) => void; editable?: boolean; placeholder?: string }) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Subscript,
      Superscript,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: placeholder ?? "Write questions here…" }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    editorProps: { attributes: { class: "prose-paper px-4 py-3" } },
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  }, [editable]);

  return (
    <div className={`overflow-visible rounded-md border ${editable ? "border-[#CBD5E1] bg-white" : "border-line bg-[#F8FAFC]"}`}>
      {editor && editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
