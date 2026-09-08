import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  AuxiliarySidebar,
  type AuxiliarySource,
} from "@/components/workbench/auxiliary-sidebar/AuxiliarySidebar";
import { Button } from "@/components/ui";
import styles from "./ConversationInspectorFixture.module.css";

/** The gallery exercises the same session-scoped tabs and panels as WorkbenchRoot. */
export function ConversationInspectorFixture({
  children,
  source,
}: {
  children: ReactNode;
  source: AuxiliarySource;
}) {
  const [open, setOpen] = useState(false);
  const [primary, setPrimary] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const ensureOpen = useCallback(() => setOpen(true), []);
  const closeEmpty = useCallback(() => {
    setOpen(false);
    setPrimary(false);
    requestAnimationFrame(() => toggleRef.current?.focus());
  }, []);
  return (
    <div className={styles.shell}>
      <div className={styles.main} hidden={primary && open}>
        {children}
      </div>
      <Button
        ref={toggleRef}
        variant="outline"
        size="sm"
        className={styles.toggle}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? "收起辅助区" : "打开辅助区"}
      </Button>
      <div className={styles.auxiliary} data-primary={primary} hidden={!open}>
        <AuxiliarySidebar
          open={open}
          primary={primary}
          onTogglePrimary={() => setPrimary((value) => !value)}
          onEnsureOpen={ensureOpen}
          onLastTabClose={closeEmpty}
          source={source}
        />
      </div>
    </div>
  );
}
