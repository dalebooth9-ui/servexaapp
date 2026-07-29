import * as React from "react";

import { cn } from "@/lib/utils";
import { DictationMic } from "@/components/ui/dictation-mic";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Set to hide the talk-to-type microphone (structured / non-prose fields). */
  disableDictation?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, disableDictation, onBlur, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);
    const micRef = React.useRef<{ stop: () => void }>(null);
    const [listening, setListening] = React.useState(false);
    const [interim, setInterim] = React.useState("");

    const enabled = !disableDictation && !props.disabled && !props.readOnly;

    const field = (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          enabled && "pr-12",
          listening && "ring-2 ring-destructive/50",
          className,
        )}
        ref={innerRef}
        onBlur={(e) => {
          micRef.current?.stop();
          onBlur?.(e);
        }}
        {...props}
      />
    );

    if (!enabled) return field;

    return (
      <div className="relative w-full">
        {field}
        <DictationMic
          ref={micRef}
          targetRef={innerRef}
          onListeningChange={setListening}
          onInterimChange={setInterim}
          className="bottom-1.5 right-1.5"
        />
        {listening && interim ? (
          <div className="pointer-events-none absolute bottom-1.5 left-2 right-14 truncate text-xs italic text-muted-foreground">
            {interim}
          </div>
        ) : null}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
