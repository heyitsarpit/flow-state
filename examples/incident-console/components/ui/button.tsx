import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  className,
  variant = "secondary",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & Readonly<{ readonly variant?: ButtonVariant }>) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/85",
        variant === "secondary" && "border bg-card hover:bg-muted",
        variant === "danger" && "bg-destructive text-white hover:bg-destructive/85",
        variant === "ghost" && "hover:bg-muted",
        className,
      )}
      {...props}
    />
  );
}
