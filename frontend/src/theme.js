import { createTheme } from "@mui/material/styles";

const PALETTES = {
  light: {
    primary: { main: "#1e4fa3" },
    secondary: { main: "#00897b" },
    background: { default: "#f5f7fb", paper: "#ffffff" },
  },
  dark: {
    primary: { main: "#7aa7ff" },
    secondary: { main: "#4db6ac" },
    background: { default: "#0d1117", paper: "#161b22" },
  },
};

export function createAppTheme(mode = "light") {
  return createTheme({
    palette: { mode, ...PALETTES[mode] },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      h4: { fontWeight: 700 },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 600 },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiCard: { defaultProps: { variant: "outlined" } },
      // Dark mode adds a subtle gradient to surfaces by default; keep them flat and consistent
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    },
  });
}
