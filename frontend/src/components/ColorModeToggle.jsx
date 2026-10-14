import { IconButton, Tooltip } from "@mui/material";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import { useColorMode } from "../context/color-mode-context";

export default function ColorModeToggle({ color = "inherit" }) {
  const { mode, toggle } = useColorMode();
  const label = mode === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <Tooltip title={label}>
      <IconButton color={color} onClick={toggle} aria-label={label}>
        {mode === "dark" ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
      </IconButton>
    </Tooltip>
  );
}
