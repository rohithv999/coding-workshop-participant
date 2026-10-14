import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1e4fa3" },
    secondary: { main: "#00897b" },
    background: { default: "#f5f7fb" },
  },
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
  },
});

export default theme;
