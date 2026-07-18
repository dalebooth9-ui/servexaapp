/**
 * Reusable props that turn any element into a keyboard-accessible file picker
 * trigger. Attach the returned spread to a dropzone `<div>` and pair it with
 * a hidden `<input type="file">` you `.click()` from `openPicker`.
 *
 * Usage:
 *   const dz = useTapPicker(() => inputRef.current?.click(), { disabled });
 *   <div {...dz} onDrop={...}>...</div>
 */
import { useCallback } from "react";

export type TapPickerProps = {
  role: "button";
  tabIndex: number;
  onClick: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  "aria-label"?: string;
  "aria-disabled"?: boolean;
};

export function useTapPicker(
  openPicker: () => void,
  opts: { disabled?: boolean; label?: string } = {},
): TapPickerProps {
  const { disabled, label } = opts;
  const onClick = useCallback(
    (_e: React.MouseEvent) => {
      if (disabled) return;
      openPicker();
    },
    [openPicker, disabled],
  );
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        openPicker();
      }
    },
    [openPicker, disabled],
  );
  return {
    role: "button",
    tabIndex: disabled ? -1 : 0,
    onClick,
    onKeyDown,
    "aria-label": label ?? "Choose files to upload",
    "aria-disabled": disabled || undefined,
  };
}
