import * as React from "react";

import { cn } from "@/lib/utils";
import { DictationMic } from "@/components/ui/dictation-mic";

export interface InputProps extends React.ComponentProps<"input"> {
  /**
   * Opt in to the talk-to-type microphone. Only for free-prose single-line
   * fields (notes, comments) — never for emails, numbers, dates or search.
   */
  dictation?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, dictation, onBlur, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);
    const micRef = React.useRef<{ stop: () => void }>(null);
    const [listening, setListening] = React.useState(false);

    const enabled =
      !!dictation && !props.disabled && !props.readOnly && (!type || type === "text" || type === "search");

    const field = (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
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
          className="top-1/2 -translate-y-1/2 right-0.5"
        />
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
