import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APP_SHORTCUTS } from "@/hooks/useKeyboardShortcuts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const groups = Array.from(new Set(APP_SHORTCUTS.map((s) => s.group)));

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground shadow-sm">
      {children}
    </kbd>
  );
}

export default function KeyboardShortcutsHelp({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-1">
          {groups.map((group) => (
            <div key={group}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group}
              </p>
              <div className="space-y-1.5">
                {APP_SHORTCUTS.filter((s) => s.group === group).map((s) => (
                  <div key={s.key} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-foreground">{s.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.meta && <><Kbd>⌘</Kbd><span className="text-muted-foreground text-xs">+</span></>}
                      {s.ctrl && <><Kbd>Ctrl</Kbd><span className="text-muted-foreground text-xs">+</span></>}
                      {s.shift && <><Kbd>⇧</Kbd><span className="text-muted-foreground text-xs">+</span></>}
                      {s.key.split(" ").map((k, i, arr) => (
                        <span key={k} className="flex items-center gap-1">
                          <Kbd>{k.toUpperCase()}</Kbd>
                          {i < arr.length - 1 && (
                            <span className="text-muted-foreground text-xs">then</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground text-center pt-1 border-t border-border">
          Press <Kbd>?</Kbd> at any time to open this panel
        </p>
      </DialogContent>
    </Dialog>
  );
}
