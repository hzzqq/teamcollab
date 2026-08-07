"use client";

import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/hooks/use-theme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Sonner
      theme={isDark ? "dark" : "light"}
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-surface group-[.toaster]:text-fg group-[.toaster]:border-border group-[.toaster]:shadow-raised group-[.toaster]:rounded-md group-[.toaster]:text-sm",
          description: "group-[.toast]:text-muted",
          actionButton: "group-[.toast]:bg-primary-600 group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-surface-warm group-[.toast]:text-fg-2",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
