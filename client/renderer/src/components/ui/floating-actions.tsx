import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import styles from "./floating-actions.module.css";

/** Place inside a positioned parent with data-floating-actions-host. */
export function FloatingActions({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(styles.root, className)}
      data-floating-actions
      data-copy-exclude
      {...props}
    />
  );
}
