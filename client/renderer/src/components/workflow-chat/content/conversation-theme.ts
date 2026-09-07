import { useEffect, useState } from "react";

// Standard MCP Apps keys map to Marloues's existing semantic contract.
// https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx#theming
const APP_TOKENS: Record<string, string> = {
  "--color-background-primary": "--surface-workspace",
  "--color-background-secondary": "--surface-popover",
  "--color-background-tertiary": "--raised-2",
  "--color-background-inverse": "--primary-fill",
  "--color-background-info": "--accent-soft",
  "--color-background-danger": "--danger-soft",
  "--color-background-success": "--success-soft",
  "--color-background-warning": "--warning-soft",
  "--color-text-primary": "--text-1",
  "--color-text-secondary": "--text-2",
  "--color-text-tertiary": "--text-3",
  "--color-text-inverse": "--primary-ink",
  "--color-text-info": "--accent",
  "--color-text-danger": "--danger",
  "--color-text-success": "--success",
  "--color-text-warning": "--warning",
  "--color-border-primary": "--border",
  "--color-border-secondary": "--border-subtle",
  "--color-border-tertiary": "--border-strong",
  "--color-border-info": "--accent",
  "--color-border-danger": "--danger",
  "--color-border-success": "--success",
  "--color-border-warning": "--warning",
  "--color-ring-primary": "--accent",
  "--font-sans": "--font-ui",
  "--font-mono": "--font-mono",
  "--font-text-xs-size": "--text-xs",
  "--font-text-sm-size": "--text-sm",
  "--font-text-md-size": "--text-md",
  "--font-text-lg-size": "--text-lg",
  "--border-radius-sm": "--radius-sm",
  "--border-radius-md": "--radius-md",
  "--border-radius-lg": "--card-radius",
  "--shadow-sm": "--shadow-sm",
  "--shadow-md": "--shadow-md",
  "--shadow-lg": "--shadow-lg",
};

export function readConversationTheme() {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    theme: css.colorScheme === "dark" ? ("dark" as const) : ("light" as const),
    styles: {
      variables: Object.fromEntries(
        Object.entries(APP_TOKENS).map(([key, source]) => [key, token(source)]),
      ),
    },
    palette: {
      background: token("--surface-workspace"),
      surface: token("--surface-popover"),
      text: token("--text-1"),
      line: token("--text-2"),
      border: token("--border"),
      accent: token("--accent"),
      accentSoft: token("--accent-soft"),
      font: token("--font-ui"),
      fontSize: token("--text-base"),
    },
  };
}
export type ConversationTheme = ReturnType<typeof readConversationTheme>;

export function observeConversationTheme(changed: () => void) {
  let frame = 0;
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(changed);
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "style"],
  });
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}

export function useConversationTheme() {
  const [theme, setTheme] = useState<ConversationTheme>();
  useEffect(() => {
    const update = () => {
      const next = readConversationTheme();
      setTheme((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    update();
    return observeConversationTheme(update);
  }, []);
  return theme;
}

export function diagramThemeVariables(theme: ConversationTheme) {
  const { palette } = theme;
  // Mermaid expects opaque hex colors. Composite translucent semantic colors
  // onto the active workspace surface instead of inventing a second palette.
  const context = document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("图表颜色转换暂不可用");
  const hex = (color: string) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = palette.background;
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return (
      "#" +
      Array.from(context.getImageData(0, 0, 1, 1).data)
        .slice(0, 3)
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("")
    );
  };
  return {
    darkMode: theme.theme === "dark",
    background: hex(palette.background),
    primaryColor: hex(palette.surface),
    primaryTextColor: hex(palette.text),
    primaryBorderColor: hex(palette.border),
    secondaryColor: hex(palette.surface),
    tertiaryColor: hex(palette.surface),
    lineColor: hex(palette.line),
    textColor: hex(palette.text),
    edgeLabelBackground: hex(palette.background),
    noteBkgColor: hex(palette.surface),
    noteTextColor: hex(palette.text),
    fontFamily: palette.font,
    fontSize: palette.fontSize,
  };
}
