import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, useCallback } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";

const COLORS = [
  { label: "Default", value: "" },
  { label: "Red", value: "#ef4444" },
  { label: "Orange", value: "#f97316" },
  { label: "Green", value: "#22c55e" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Purple", value: "#a855f7" },
  { label: "Gray", value: "#6b7280" },
];

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded text-xs transition-colors",
        "hover:bg-muted hover:text-foreground",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1">
      <ToolbarButton
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline"
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </ToolbarButton>

      <div className="mx-1 h-4 w-px bg-border" />

      <ToolbarButton
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet List"
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered List"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>

      <div className="mx-1 h-4 w-px bg-border" />

      <div className="relative group">
        <ToolbarButton
          active={!!editor.getAttributes("textStyle").color}
          onClick={() => {}}
          title="Text Color"
        >
          <Palette className="h-3.5 w-3.5" />
        </ToolbarButton>
        {/* pt-2 creates hover bridge so dropdown stays visible when moving mouse down */}
        <div className="absolute left-0 top-full z-50 hidden group-hover:flex flex-col pt-2">
          <div className="flex flex-row gap-1 rounded-md border border-border bg-popover p-1.5 shadow-md">
          {COLORS.map((c) => (
            <button
              key={c.value || "default"}
              type="button"
              title={c.label}
              onClick={() => {
                if (c.value) {
                  editor.chain().focus().setColor(c.value).run();
                } else {
                  editor.chain().focus().unsetColor().run();
                }
              }}
              className={cn(
                "h-5 w-5 rounded-full border border-border transition-transform hover:scale-125",
                !c.value && "bg-foreground"
              )}
              style={c.value ? { backgroundColor: c.value } : undefined}
            />
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = "80px",
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleUpdate = useCallback(
    ({ editor: e }: { editor: Editor }) => {
      const html = e.getHTML();
      const isEmpty = e.isEmpty;
      onChangeRef.current(isEmpty ? "" : html);
    },
    []
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      TextStyle,
      Color,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value || "",
    onUpdate: handleUpdate,
    editorProps: {
      attributes: {
        class: `tiptap focus:outline-none px-3 py-2 text-sm text-foreground`,
        style: `min-height:${minHeight}`,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-secondary/20 overflow-hidden focus-within:ring-1 focus-within:ring-ring",
        className
      )}
    >
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

export function RichTextDisplay({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  if (!value) {
    return (
      <span className="text-muted-foreground/50 italic">—</span>
    );
  }

  const isPlainText = !value.startsWith("<");

  if (isPlainText) {
    return (
      <p className={cn("text-sm text-foreground min-h-[1.5rem] whitespace-pre-wrap", className)}>
        {value}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-sm text-foreground min-h-[1.5rem]",
        "[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4",
        "[&_li]:my-0 [&_p]:my-0",
        "[&_p:empty]:min-h-[1em] [&_p:empty]:block",
        className
      )}
      dangerouslySetInnerHTML={{ __html: value }}
    />
  );
}
