import * as React from "react";
import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDictation, tidyDictated } from "@/hooks/useDictation";
import { useToast } from "@/hooks/use-toast";

/**
 * Inserts text at the current cursor position of an input/textarea while
 * keeping React controlled components in sync (native setter + input event).
 */
export function insertAtCursor(el: HTMLInputElement | HTMLTextAreaElement, insert: string) {
  const value = el.value ?? "";
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? start;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const needsSpace = before && !/\s$/.test(before) && !/^[,.;:!?]/.test(insert);
  const chunk = (needsSpace ? " " : "") + insert;
  const next = before + chunk + after;

  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter ? setter.call(el, next) : (el.value = next);
  el.dispatchEvent(new Event("input", { bubbles: true }));

  const caret = before.length + chunk.length;
  try {
    el.setSelectionRange(caret, caret);
  } catch {
    /* some input types don't support selection */
  }
}

interface DictationMicProps {
  targetRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>;
  className?: string;
  /** exposes listening state to the parent (for interim preview / styling) */
  onListeningChange?: (listening: boolean) => void;
  onInterimChange?: (text: string) => void;
  disabled?: boolean;
}

export const DictationMic = React.forwardRef<{ stop: () => void }, DictationMicProps>(
  ({ targetRef, className, onListeningChange, onInterimChange, disabled }, ref) => {
    const { toast } = useToast();

    const { supported, listening, toggle, stop } = useDictation({
      onFinal: (text) => {
        const el = targetRef.current;
        if (!el) return;
        const before = el.value.slice(0, el.selectionStart ?? el.value.length);
        const tidied = tidyDictated(text, before);
        if (tidied) insertAtCursor(el, tidied);
      },
      onInterim: (t) => onInterimChange?.(t),
      onError: (message) => toast({ title: "Voice input", description: message }),
    });

    React.useImperativeHandle(ref, () => ({ stop }), [stop]);
    React.useEffect(() => onListeningChange?.(listening), [listening, onListeningChange]);

    if (!supported) return null;

    return (
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label={listening ? "Stop dictation" : "Dictate text"}
        title={listening ? "Stop dictation" : "Talk to type"}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!listening) targetRef.current?.focus();
          toggle();
        }}
        className={cn(
          "absolute z-10 flex h-11 w-11 items-center justify-center rounded-full transition-colors",
          "text-muted-foreground hover:text-foreground hover:bg-muted/70 active:bg-muted",
          listening && "text-destructive",
          disabled && "opacity-40 pointer-events-none",
          className,
        )}
      >
        {listening ? (
          <>
            <span className="absolute inset-1 rounded-full bg-destructive/20 animate-ping" />
            <MicOff className="h-5 w-5 relative" />
          </>
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </button>
    );
  },
);
DictationMic.displayName = "DictationMic";
