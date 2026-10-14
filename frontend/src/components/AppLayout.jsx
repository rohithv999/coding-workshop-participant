import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useMediaQuery } from "react-responsive";
import {
  AppBar, Avatar, Box, Chip, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Menu, MenuItem, Toolbar, Tooltip, Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import BarChartIcon from "@mui/icons-material/BarChart";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import HistoryIcon from "@mui/icons-material/History";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import { useAuth } from "../context/auth-context";
import ColorModeToggle from "./ColorModeToggle";

const DRAWER_WIDTH = 240;

// roles: null = everyone; otherwise only the listed roles see the link
const NAV_ITEMS = [
  { label: "Dashboard", path: "/", icon: <DashboardOutlinedIcon />, roles: null, end: true },
  { label: "Projects", path: "/projects", icon: <FolderOutlinedIcon />, roles: null },
  { label: "Users", path: "/users", icon: <PeopleOutlinedIcon />, roles: ["admin", "manager"] },
  { label: "Workload", path: "/workload", icon: <BarChartIcon />, roles: ["admin", "manager"] },
  { label: "Archive", path: "/archive", icon: <ArchiveOutlinedIcon />, roles: ["admin"] },
  { label: "Audit log", path: "/audit-log", icon: <HistoryIcon />, roles: ["admin"] },
  { label: "My profile", path: "/profile", icon: <PersonOutlinedIcon />, roles: null },
];

const ROLE_LABELS = { admin: "Admin", manager: "Manager", employee: "Employee" };

export default function AppLayout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const isMobile = useMediaQuery({ maxWidth: 899 });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || hasRole(...item.roles));
  const initials = `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase();

  const handleSignOut = () => {
    setMenuAnchor(null);
    logout();
  };

  const navList = (
    <Box component="nav" aria-label="Main navigation">
      <Toolbar />
      <List sx={{ px: 1 }}>
        {visibleItems.map((item) => (
          <ListItemButton
            key={item.path}
            component={NavLink}
            to={item.path}
            end={item.end}
            onClick={() => isMobile && setDrawerOpen(false)}
            sx={{
              borderRadius: 2,
              mb: 0.5,
              "&.active": {
                bgcolor: "primary.main",
                color: "primary.contrastText",
                "& .MuiListItemIcon-root": { color: "primary.contrastText" },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          {isMobile && (
            <IconButton
              color="inherit"
              edge="start"
              aria-label="Open navigation menu"
              onClick={() => setDrawerOpen(true)}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }} noWrap>
            ACME Project Tracker
          </Typography>
          {!isMobile && (
            <Chip
              label={ROLE_LABELS[user.role]}
              size="small"
              sx={{ mr: 1.5, bgcolor: "rgba(255,255,255,0.2)", color: "inherit" }}
            />
          )}
          <ColorModeToggle />
          <Tooltip title="Account">
            <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="Open account menu">
              <Avatar sx={{ width: 34, height: 34, bgcolor: "secondary.main", fontSize: 14 }}>{initials}</Avatar>
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography sx={{ fontWeight: 600 }}>
                {user.first_name} {user.last_name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {user.username} · {ROLE_LABELS[user.role]}
              </Typography>
            </Box>
            <Divider />
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                navigate("/profile");
              }}
            >
              <ListItemIcon>
                <PersonOutlinedIcon fontSize="small" />
              </ListItemIcon>
              My profile
            </MenuItem>
            <MenuItem onClick={handleSignOut}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Sign out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {isMobile ? (
        <Drawer
          variant="temporary"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          sx={{ "& .MuiDrawer-paper": { width: DRAWER_WIDTH } }}
        >
          {navList}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" },
          }}
        >
          {navList}
        </Drawer>
      )}

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, sm: 3 } }}>
        <Toolbar />
        <Box sx={{ maxWidth: 1200, mx: "auto" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
