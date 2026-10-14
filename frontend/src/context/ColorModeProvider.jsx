import { useMemo, useState } from "react";
import { useMediaQuery } from "react-responsive";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { createAppTheme } from "../theme";
import { ColorModeContext } from "./color-mode-context";

const STORAGE_KEY = "pt_color_mode";

function readSavedMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null; // storage unavailable (e.g. private browsing)
  }
}

export default function ColorModeProvider({ children }) {
  // Until the user picks a mode, follow the operating system's setting
  const prefersDark = useMediaQuery({ query: "(prefers-color-scheme: dark)" });
  const [chosenMode, setChosenMode] = useState(readSavedMode);
  const mode = chosenMode || (prefersDark ? "dark" : "light");

  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const value = useMemo(
    () => ({
      mode,
      toggle: () => {
        const next = mode === "dark" ? "light" : "dark";
        setChosenMode(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // storage unavailable: the choice still applies for this visit
        }
      },
    }),
    [mode],
  );

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        {/* enableColorScheme makes native controls (date pickers, scrollbars) match the theme */}
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
