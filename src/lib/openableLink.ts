import type { KeyboardEvent, MouseEvent } from "react";

/**
 * True when the browser should handle the click itself (new tab, new window,
 * background tab) instead of the app routing in place.
 */
export function isModifiedClick(event: MouseEvent): boolean {
  return event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0;
}

/** Open a destination in a new browser tab. */
export function openInNewTab(href: string): void {
  window.open(href, "_blank", "noopener,noreferrer");
}

/**
 * Props that make a non-anchor element (a table row, a list item, a card body)
 * behave like a link: a plain click routes in-app, while Ctrl/Cmd/Shift click
 * and middle click open the destination in a new tab.
 */
export function openableLinkProps(
  href: string,
  navigate: (to: string) => void,
): {
  tabIndex: number;
  onClick: (event: MouseEvent) => void;
  onMouseDown: (event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
} {
  return {
    tabIndex: 0,
    onClick: (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      // A row is not an anchor, so the browser won't open modified clicks itself.
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        openInNewTab(href);
        return;
      }
      navigate(href);
    },
    onMouseDown: (event) => {
      // A middle click carries no link semantics on a row, so open it ourselves.
      if (event.button === 1) {
        event.preventDefault();
        openInNewTab(href);
      }
    },
    onKeyDown: (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        navigate(href);
      }
    },
  };
}
