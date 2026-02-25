import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

function readCssVar(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

export function useChartColors() {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState(() => getColors());

  function getColors() {
    if (typeof window === "undefined") return fallback();
    const root = document.documentElement;
    if (!root) return fallback();

    return {
      grid: readCssVar("--chart-grid") || "hsl(220, 14%, 88%)",
      axisText: readCssVar("--chart-axis-text") || "hsl(220, 10%, 45%)",
      axisLine: readCssVar("--chart-axis-line") || "hsl(220, 14%, 88%)",
      tooltipBg: readCssVar("--chart-tooltip-bg") || "hsl(0, 0%, 100%)",
      tooltipBorder: readCssVar("--chart-tooltip-border") || "hsl(220, 14%, 88%)",
      tooltipText: readCssVar("--chart-tooltip-text") || "hsl(220, 25%, 12%)",
    };
  }

  function fallback() {
    return {
      grid: "hsl(220, 14%, 88%)",
      axisText: "hsl(220, 10%, 45%)",
      axisLine: "hsl(220, 14%, 88%)",
      tooltipBg: "hsl(0, 0%, 100%)",
      tooltipBorder: "hsl(220, 14%, 88%)",
      tooltipText: "hsl(220, 25%, 12%)",
    };
  }

  useEffect(() => {
    requestAnimationFrame(() => setColors(getColors()));
  }, [resolvedTheme]);

  return colors;
}
