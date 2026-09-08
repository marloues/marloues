import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import styles from "./button.module.css";

const buttonVariants = cva(styles.button, {
  variants: {
    variant: {
      default: styles.primary,
      destructive: styles.destructive,
      outline: styles.outline,
      secondary: styles.secondary,
      ghost: styles.ghost,
      link: styles.link,
      neon: styles.neon,
      glow: styles.glow,
    },
    size: {
      default: styles.normal,
      sm: styles.small,
      lg: styles.large,
      icon: styles.icon,
      "icon-sm": styles.iconSmall,
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
