"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** 主题切换（DESIGN.md §9.2）：data-theme 切换 + localStorage */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={className}
            onClick={toggleTheme}
            aria-label={isDark ? "切换到浅色主题" : "切换到深色主题"}
          >
            {isDark ? <Sun size={20} strokeWidth={1.5} /> : <Moon size={20} strokeWidth={1.5} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isDark ? "浅色主题" : "深色主题"}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
