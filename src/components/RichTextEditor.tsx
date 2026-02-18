import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Heading2, Undo, Redo, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const HIGHLIGHT_COLORS = [
  { label: "Default", value: "" },
  { label: "Red", value: "#ef4444" },
  { label: "Orange", value: "#f97316" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Green", value: "#22c55e" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Purple", value: "#a855f7" },
  { label: "Pink", value: "#ec4899" },
];

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
}

export default function RichTextEditor({ content, onChange, placeholder = "Start writing...", editable = true }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Placeholder.configure({ placeholder }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) return null;

  if (!editable) {
    return (
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <EditorContent editor={editor} />
      </div>
    );
  }

  const ToolbarButton = ({ onClick, active, children, title }: { onClick: () => void; active?: boolean; children: React.ReactNode; title: string }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("h-8 w-8 p-0", active && "bg-muted")}
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );

  const currentColor = editor.getAttributes("textStyle").color || "";

  return (
    <div className="rounded-md border border-input bg-background">
      <div className="flex flex-wrap gap-0.5 border-b border-input px-2 py-1">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline">
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className={cn("h-8 w-8 p-0", currentColor && "bg-muted")} title="Font colour">
              <div className="relative">
                <Palette className="h-4 w-4" />
                {currentColor && (
                  <span className="absolute -bottom-1 left-1/2 h-1 w-3 -translate-x-1/2 rounded-full" style={{ backgroundColor: currentColor }} />
                )}
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="grid grid-cols-4 gap-1.5">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  title={c.label}
                  className={cn(
                    "h-7 w-7 rounded-md border transition-transform hover:scale-110",
                    currentColor === c.value && "ring-2 ring-ring ring-offset-1"
                  )}
                  style={{ backgroundColor: c.value || "hsl(var(--foreground))" }}
                  onClick={() => {
                    if (c.value) {
                      editor.chain().focus().setColor(c.value).run();
                    } else {
                      editor.chain().focus().unsetColor().run();
                    }
                  }}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading">
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <div className="min-h-[200px] px-3 py-2">
        <EditorContent editor={editor} className="prose prose-sm max-w-none dark:prose-invert focus:outline-none [&_.tiptap]:outline-none [&_.tiptap]:min-h-[180px]" />
      </div>
    </div>
  );
}
