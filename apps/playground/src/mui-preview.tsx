import { useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import Avatar from "@mui/material/Avatar";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import LinearProgress from "@mui/material/LinearProgress";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import SvgIcon from "@mui/material/SvgIcon";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import type { Theme, ThemeOptions } from "@mui/material/styles";
import { safeParseMuiAdapterPreview } from "@s9rg/theme-adapter-mui";
import type { JsonValue } from "@s9rg/theme-compiler";
import type { ThemeUpdateMessage } from "@s9rg/theme-demo-protocol";

interface ColorSchemeThemeProviderProps {
  readonly children: ReactNode;
  readonly theme: Theme;
  readonly defaultMode: "light" | "dark";
  readonly colorSchemeNode: Element;
  readonly storageManager: null;
  readonly noSsr: true;
}

interface IconGlyphProps {
  readonly path: string;
  readonly size?: "inherit" | "small";
}

interface Metric {
  readonly label: string;
  readonly value: string;
  readonly change: string;
  readonly context: string;
  readonly tone: "primary" | "secondary";
}

interface Account {
  readonly name: string;
  readonly initials: string;
  readonly domain: string;
  readonly plan: "Pro" | "Scale";
  readonly status: "Active" | "Review";
  readonly revenue: string;
}

const ICON_PATHS = {
  analytics: "M4 19h16v2H4v-2Zm1-2V9h3v8H5Zm5 0V3h3v14h-3Zm5 0v-5h3v5h-3Z",
  bell: "M12 22a2.4 2.4 0 0 0 2.25-1.6h-4.5A2.4 2.4 0 0 0 12 22Zm7-5.2V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5.8L3.4 18.4V20h17.2v-1.6L19 16.8Z",
  billing:
    "M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 14H3v-6h18v6Zm0-10H3V6h18v2Z",
  calendar:
    "M7 2v2H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3h-2V2h-2v2H9V2H7Zm12 18H5a1 1 0 0 1-1-1v-8h16v8a1 1 0 0 1-1 1ZM4 9V7a1 1 0 0 1 1-1h2v2h2V6h6v2h2V6h2a1 1 0 0 1 1 1v2H4Z",
  customers:
    "M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3ZM8 11c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm8 2c-2 0-6 1-6 3v3h12v-3c0-2-4-3-6-3ZM8 13c-2.33 0-7 1.17-7 3.5V19h7v-3c0-.85.33-1.57.88-2.17A8.17 8.17 0 0 0 8 13Z",
  dashboard: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
  help: "M11 18h2v-2h-2v2Zm1-16a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 14a6 6 0 1 1 0-12 6 6 0 0 1 0 12Zm0-10a4 4 0 0 0-3.87 3h2.08A2 2 0 1 1 12 12a1 1 0 0 0-1 1v1h2v-.23A4 4 0 0 0 12 6Z",
  more: "M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
  plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z",
  reports:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13ZM8 13h8v2H8v-2Zm0 4h8v2H8v-2Z",
  search:
    "m15.5 14-1-.79A6.5 6.5 0 1 0 13.21 14l.79 1 5 5 1.5-1.5-5-4.5ZM5 9.5a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0Z",
  settings:
    "M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.08-.98l2.11-1.65-2-3.46-2.49 1a7.21 7.21 0 0 0-1.69-.98L15 3.27h-4l-.35 2.66c-.61.25-1.17.58-1.69.98l-2.49-1-2 3.46 2.11 1.65c-.05.32-.08.66-.08.98s.03.66.08.98l-2.11 1.65 2 3.46 2.49-1c.52.4 1.08.73 1.69.98L11 20.73h4l.35-2.66c.61-.25 1.17-.58 1.69-.98l2.49 1 2-3.46-2.1-1.65ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z",
  team: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z",
} as const;

const METRICS: readonly Metric[] = [
  {
    label: "Monthly revenue",
    value: "$84.2k",
    change: "+12.8%",
    context: "vs. $74.7k last month",
    tone: "primary",
  },
  {
    label: "Active accounts",
    value: "1,429",
    change: "+6.4%",
    context: "86 joined this month",
    tone: "secondary",
  },
  {
    label: "Customer churn",
    value: "2.1%",
    change: "↓ 0.3%",
    context: "Below the 2.5% target",
    tone: "primary",
  },
] as const;

const ACCOUNTS: readonly Account[] = [
  {
    name: "Acme Studio",
    initials: "AS",
    domain: "acme.design",
    plan: "Scale",
    status: "Active",
    revenue: "$12,480",
  },
  {
    name: "Linear Road",
    initials: "LR",
    domain: "linearroad.co",
    plan: "Pro",
    status: "Review",
    revenue: "$8,240",
  },
  {
    name: "Monarch Labs",
    initials: "ML",
    domain: "monarch.io",
    plan: "Scale",
    status: "Active",
    revenue: "$6,940",
  },
] as const;

const TEAM_ACTIVITY = [
  {
    initials: "JL",
    summary: "Jamie published Q3 report",
    time: "8 minutes ago",
    tone: "secondary" as const,
  },
  {
    initials: "MO",
    summary: "Morgan added 4 accounts",
    time: "32 minutes ago",
    tone: "primary" as const,
  },
  {
    initials: "AK",
    summary: "Alex updated the forecast",
    time: "1 hour ago",
    tone: "secondary" as const,
  },
] as const;

// MUI conditionally exposes colorSchemeNode only when its app-wide CSS-variable augmentation is
// enabled. The runtime supports it for every createTheme({ cssVariables }) result, so keep this
// narrow adapter local instead of augmenting the neutral host application's Theme type.
const ColorSchemeThemeProvider =
  ThemeProvider as unknown as ComponentType<ColorSchemeThemeProviderProps>;

function IconGlyph({ path, size = "small" }: IconGlyphProps) {
  return (
    <SvgIcon fontSize={size} aria-hidden="true">
      <path d={path} />
    </SvgIcon>
  );
}

function Navigation() {
  const navItems = [
    { label: "Overview", path: ICON_PATHS.dashboard, selected: true },
    { label: "Analytics", path: ICON_PATHS.analytics, selected: false },
    { label: "Customers", path: ICON_PATHS.customers, selected: false },
    { label: "Billing", path: ICON_PATHS.billing, selected: false },
    { label: "Team", path: ICON_PATHS.team, selected: false },
    { label: "Reports", path: ICON_PATHS.reports, selected: false },
  ] as const;

  return (
    <Box
      component="aside"
      className="mui-dashboard-sidebar"
      aria-label="Workspace navigation"
      sx={{
        display: "flex",
        minHeight: 0,
        flexDirection: "column",
        borderRight: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        px: 1,
        py: 1.5,
      }}
    >
      <Stack
        direction="row"
        spacing={0.85}
        sx={{ alignItems: "center", px: 0.5 }}
      >
        <Box
          sx={{
            display: "grid",
            width: 28,
            height: 28,
            flex: "none",
            placeItems: "center",
            borderRadius: 1.5,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            fontSize: 13,
            fontWeight: 850,
            boxShadow: 1,
          }}
        >
          N
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            noWrap
            sx={{ display: "block", fontWeight: 800 }}
          >
            Northstar
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ display: "block", fontSize: 11, lineHeight: 1 }}
          >
            Growth
          </Typography>
        </Box>
      </Stack>

      <List component="nav" aria-label="Primary" disablePadding sx={{ mt: 2 }}>
        {navItems.map((item) => (
          <ListItemButton
            key={item.label}
            selected={item.selected}
            aria-current={item.selected ? "page" : undefined}
            sx={{
              minHeight: 34,
              mb: 0.35,
              borderRadius: 1.5,
              px: 0.85,
              color: item.selected ? "primary.main" : "text.secondary",
            }}
          >
            <ListItemIcon sx={{ minWidth: 27, color: "inherit" }}>
              <IconGlyph path={item.path} />
            </ListItemIcon>
            <ListItemText
              primary={
                <Typography
                  variant="caption"
                  noWrap
                  sx={{ fontSize: 11, fontWeight: item.selected ? 750 : 550 }}
                >
                  {item.label}
                </Typography>
              }
            />
            {item.label === "Analytics" ? (
              <Chip
                label="8"
                size="small"
                color="primary"
                sx={{ height: 20, minWidth: 20, fontSize: 11 }}
              />
            ) : null}
          </ListItemButton>
        ))}
      </List>

      <Card
        variant="outlined"
        className="mui-dashboard-plan"
        sx={{ mt: "auto", borderRadius: 2, bgcolor: "background.default" }}
      >
        <CardContent sx={{ p: "9px !important" }}>
          <Typography
            variant="caption"
            sx={{ display: "block", fontWeight: 750 }}
          >
            Scale plan
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 0.2, fontSize: 11 }}
          >
            18 of 25 seats used
          </Typography>
          <LinearProgress
            variant="determinate"
            value={72}
            color="secondary"
            sx={{ height: 4, mt: 0.8, borderRadius: 4 }}
          />
          <Button
            size="small"
            variant="text"
            sx={{ mt: 0.35, minWidth: 0, px: 0, fontSize: 11 }}
          >
            Manage plan
          </Button>
        </CardContent>
      </Card>
      <Divider sx={{ my: 0.75 }} />
      <ListItemButton
        sx={{
          minHeight: 34,
          borderRadius: 1.5,
          px: 0.85,
          color: "text.secondary",
        }}
      >
        <ListItemIcon sx={{ minWidth: 27, color: "inherit" }}>
          <IconGlyph path={ICON_PATHS.settings} />
        </ListItemIcon>
        <ListItemText
          primary={
            <Typography
              variant="caption"
              sx={{ fontSize: 11, fontWeight: 550 }}
            >
              Settings
            </Typography>
          }
        />
      </ListItemButton>
      <ListItemButton
        sx={{
          minHeight: 34,
          borderRadius: 1.5,
          px: 0.85,
          color: "text.secondary",
        }}
      >
        <ListItemIcon sx={{ minWidth: 27, color: "inherit" }}>
          <IconGlyph path={ICON_PATHS.help} />
        </ListItemIcon>
        <ListItemText
          primary={
            <Typography
              variant="caption"
              sx={{ fontSize: 11, fontWeight: 550 }}
            >
              Help
            </Typography>
          }
        />
      </ListItemButton>
    </Box>
  );
}

function WorkspaceHeader() {
  return (
    <Box
      component="header"
      sx={{
        display: "flex",
        minWidth: 0,
        height: 58,
        alignItems: "center",
        gap: 1,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        px: 1.5,
      }}
    >
      <Stack
        className="mui-dashboard-breadcrumbs"
        direction="row"
        spacing={0.65}
        sx={{ flex: "none", alignItems: "center" }}
      >
        <Typography variant="caption" color="text.secondary">
          Northstar
        </Typography>
        <Typography variant="caption" color="text.secondary">
          /
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 700 }}>
          Overview
        </Typography>
      </Stack>
      <Paper
        component="label"
        className="mui-dashboard-search"
        variant="outlined"
        sx={{
          display: "flex",
          minWidth: 0,
          maxWidth: 270,
          flex: "1 1 230px",
          alignItems: "center",
          gap: 0.65,
          borderRadius: 2,
          bgcolor: "background.default",
          px: 0.9,
          py: 0.25,
        }}
      >
        <IconGlyph path={ICON_PATHS.search} />
        <InputBase
          placeholder="Search workspace"
          inputProps={{ "aria-label": "Search workspace" }}
          sx={{
            minWidth: 0,
            flex: 1,
            fontSize: 11,
            "& input": { minWidth: 0 },
          }}
        />
        <Typography
          className="search-shortcut"
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: 11 }}
        >
          ⌘K
        </Typography>
      </Paper>

      <IconButton size="small" aria-label="Notifications" sx={{ ml: "auto" }}>
        <Badge color="primary" variant="dot">
          <IconGlyph path={ICON_PATHS.bell} />
        </Badge>
      </IconButton>
      <Divider orientation="vertical" flexItem sx={{ my: 1.25 }} />
      <Avatar
        alt="Sam Kim"
        sx={{
          width: 29,
          height: 29,
          bgcolor: "secondary.main",
          color: "secondary.contrastText",
          fontSize: 11,
          fontWeight: 750,
        }}
      >
        SK
      </Avatar>
      <Box className="profile-copy" sx={{ minWidth: 0 }}>
        <Typography
          variant="caption"
          noWrap
          sx={{ display: "block", fontWeight: 700 }}
        >
          Sam Kim
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", fontSize: 11, lineHeight: 1 }}
        >
          Admin
        </Typography>
      </Box>
    </Box>
  );
}

function MetricCard({ metric }: { readonly metric: Metric }) {
  const metricId = metric.label.toLowerCase().replaceAll(" ", "-");
  const path =
    metric.label === "Monthly revenue"
      ? "M2 27C15 26 14 19 27 21s16 4 25-3 16-9 25-5 15-1 22-7 12-2 19-4"
      : metric.label === "Active accounts"
        ? "M2 24c10-1 13-9 24-8s16 9 27 5 13-11 25-9 17 9 24 3 7-8 16-9"
        : "M2 6c9 2 13 8 23 7s14-6 23-2 14 10 24 8 13-8 24-5 13 8 22 11";

  return (
    <Card
      className="mui-dashboard-kpi"
      data-preview-kpi={metricId}
      variant="outlined"
      sx={{
        minWidth: 0,
        borderRadius: 2.5,
        bgcolor: "background.paper",
        boxShadow: "0 1px 2px rgb(0 0 0 / 0.04)",
      }}
    >
      <CardContent sx={{ p: "13px !important" }}>
        <Typography variant="caption" color="text.secondary">
          {metric.label}
        </Typography>
        <Stack
          direction="row"
          spacing={0.75}
          sx={{
            mt: 0.55,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography
            component="p"
            sx={{
              minWidth: 0,
              fontSize: "clamp(1.2rem, 4cqi, 1.5rem)",
              fontWeight: 760,
              letterSpacing: "-0.035em",
            }}
          >
            {metric.value}
          </Typography>
          <Chip
            label={metric.change}
            color={metric.tone}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: 11, fontWeight: 700 }}
          />
        </Stack>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 0.35, fontSize: 11 }}
        >
          {metric.context}
        </Typography>
        <Box
          component="svg"
          viewBox="0 0 120 32"
          preserveAspectRatio="none"
          aria-hidden="true"
          sx={{
            display: "block",
            width: "100%",
            height: 27,
            mt: 0.8,
            color: `${metric.tone}.main`,
          }}
        >
          <path
            d={`${path} L118 32 L2 32 Z`}
            fill="currentColor"
            opacity="0.08"
          />
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.5"
          />
        </Box>
      </CardContent>
    </Card>
  );
}

function RevenueChart() {
  const revenue = [42, 54, 48, 67, 58, 76, 69, 88] as const;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
  ] as const;

  return (
    <Card
      component="section"
      data-preview-chart="revenue-performance"
      variant="outlined"
      aria-labelledby="revenue-title"
      sx={{ minWidth: 0, borderRadius: 2.5, bgcolor: "background.paper" }}
    >
      <CardContent sx={{ p: "14px !important" }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
        >
          <Box>
            <Typography id="revenue-title" variant="subtitle2">
              Revenue performance
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Net revenue across all channels
            </Typography>
          </Box>
          <Chip
            label="Last 8 months"
            size="small"
            variant="outlined"
            sx={{ height: 22, fontSize: 11 }}
          />
        </Stack>

        <Stack
          direction="row"
          spacing={0.85}
          sx={{ mt: 1.5, flexWrap: "wrap", alignItems: "baseline" }}
        >
          <Typography
            component="p"
            sx={{ fontSize: 21, fontWeight: 760, letterSpacing: "-0.04em" }}
          >
            $476,290
          </Typography>
          <Typography
            variant="caption"
            color="primary.main"
            sx={{ fontWeight: 750 }}
          >
            +18.2%
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: 11 }}
          >
            vs. previous period
          </Typography>
        </Stack>

        <Box
          className="mui-dashboard-chart"
          role="img"
          aria-label="Recurring and services revenue increased over the last eight months"
          sx={{
            display: "flex",
            height: 130,
            alignItems: "flex-end",
            gap: "clamp(4px, 1.3cqi, 9px)",
            mt: 1.2,
            borderBottom: 1,
            borderColor: "divider",
            backgroundImage:
              "linear-gradient(to bottom, transparent 32%, color-mix(in srgb, currentColor 8%, transparent) 33%, transparent 34%, transparent 65%, color-mix(in srgb, currentColor 8%, transparent) 66%, transparent 67%)",
          }}
        >
          {revenue.map((height, index) => (
            <Stack
              key={`${months[index]}-${height}`}
              direction="row"
              spacing={0.35}
              sx={{
                minWidth: 0,
                height: "100%",
                flex: 1,
                alignItems: "flex-end",
                justifyContent: "center",
              }}
            >
              <Box
                sx={{
                  width: "min(10px, 40%)",
                  height: `${height}%`,
                  borderRadius: "3px 3px 0 0",
                  bgcolor: "primary.main",
                }}
              />
              <Box
                sx={{
                  width: "min(10px, 40%)",
                  height: `${Math.max(24, height - 18 + (index % 3) * 4)}%`,
                  borderRadius: "3px 3px 0 0",
                  bgcolor: "secondary.main",
                }}
              />
            </Stack>
          ))}
        </Box>
        <Stack
          direction="row"
          aria-hidden="true"
          sx={{ mt: 0.5, justifyContent: "space-around" }}
        >
          {months.map((label) => (
            <Typography
              key={label}
              variant="caption"
              color="text.secondary"
              sx={{ flex: 1, textAlign: "center", fontSize: 11 }}
            >
              {label}
            </Typography>
          ))}
        </Stack>
        <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: 11 }}
          >
            <Box
              component="span"
              sx={{
                display: "inline-block",
                width: 7,
                height: 7,
                mr: 0.5,
                borderRadius: 0.5,
                bgcolor: "primary.main",
              }}
            />
            Recurring
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: 11 }}
          >
            <Box
              component="span"
              sx={{
                display: "inline-block",
                width: 7,
                height: 7,
                mr: 0.5,
                borderRadius: 0.5,
                bgcolor: "secondary.main",
              }}
            />
            Services
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function GoalCard() {
  return (
    <Card
      component="section"
      data-preview-goal="q3-revenue"
      variant="outlined"
      aria-labelledby="goal-title"
      sx={{ minWidth: 0, borderRadius: 2.5, bgcolor: "background.paper" }}
    >
      <CardContent sx={{ p: "14px !important" }}>
        <Stack
          direction="row"
          sx={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <Box>
            <Typography id="goal-title" variant="subtitle2">
              Quarterly goal
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Q3 revenue target
            </Typography>
          </Box>
          <IconButton size="small" aria-label="More goal options">
            <IconGlyph path={ICON_PATHS.more} />
          </IconButton>
        </Stack>

        <Box
          sx={{
            position: "relative",
            display: "grid",
            width: 112,
            height: 112,
            placeItems: "center",
            mx: "auto",
            my: 1.8,
          }}
        >
          <CircularProgress
            variant="determinate"
            value={100}
            size={112}
            thickness={4}
            sx={{ position: "absolute", color: "divider" }}
          />
          <CircularProgress
            variant="determinate"
            value={78}
            size={112}
            thickness={4}
            color="secondary"
            sx={{
              position: "absolute",
              "& circle": { strokeLinecap: "round" },
            }}
          />
          <Box sx={{ position: "relative", textAlign: "center" }}>
            <Typography
              sx={{ fontSize: 25, fontWeight: 780, letterSpacing: "-0.045em" }}
            >
              78%
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", fontSize: 11 }}
            >
              complete
            </Typography>
          </Box>
        </Box>

        <Stack
          direction="row"
          sx={{ justifyContent: "space-around", textAlign: "center" }}
        >
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", fontSize: 11 }}
            >
              Current
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 750 }}>
              $476k
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", fontSize: 11 }}
            >
              Target
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 750 }}>
              $610k
            </Typography>
          </Box>
        </Stack>

        <Paper
          variant="outlined"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.8,
            mt: 1.7,
            p: 1,
            borderRadius: 1.5,
            bgcolor: "background.default",
          }}
        >
          <Box
            sx={{
              width: 7,
              height: 7,
              flex: "none",
              borderRadius: "50%",
              bgcolor: "primary.main",
            }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{ display: "block", fontWeight: 750 }}
            >
              On track
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ display: "block", fontSize: 11 }}
            >
              $44.7k needed per month
            </Typography>
          </Box>
        </Paper>
      </CardContent>
    </Card>
  );
}

function AccountTable() {
  return (
    <Card
      component="section"
      data-preview-table="recent-accounts"
      variant="outlined"
      aria-labelledby="accounts-title"
      sx={{ minWidth: 0, borderRadius: 2.5, bgcolor: "background.paper" }}
    >
      <CardContent sx={{ p: "0 !important" }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ p: 1.5, alignItems: "center", justifyContent: "space-between" }}
        >
          <Box>
            <Typography id="accounts-title" variant="subtitle2">
              Recent accounts
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Customers with new activity
            </Typography>
          </Box>
          <Button size="small" variant="outlined">
            View all
          </Button>
        </Stack>
        <Table
          size="small"
          aria-label="Recent accounts"
          sx={{
            tableLayout: "fixed",
            "& th": {
              color: "text.secondary",
              bgcolor: "background.default",
              fontSize: 11,
              fontWeight: 750,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            },
            "& th, & td": { px: 1.5, py: 0.9, borderColor: "divider" },
            "& tr:last-child td": { borderBottom: 0 },
            "@container muiPreview (max-width: 600px)": {
              "& .account-plan": { display: "none" },
            },
            "@container muiPreview (max-width: 480px)": {
              "& .account-status": { display: "none" },
              "& th:first-of-type": { width: "62%" },
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: "40%" }}>Account</TableCell>
              <TableCell className="account-plan">Plan</TableCell>
              <TableCell className="account-status">Status</TableCell>
              <TableCell align="right">Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ACCOUNTS.map((account) => (
              <TableRow key={account.name}>
                <TableCell>
                  <Stack
                    direction="row"
                    spacing={0.9}
                    sx={{ minWidth: 0, alignItems: "center" }}
                  >
                    <Avatar
                      sx={{
                        width: 25,
                        height: 25,
                        flex: "none",
                        bgcolor: "action.selected",
                        color: "text.primary",
                        fontSize: 11,
                        fontWeight: 750,
                      }}
                    >
                      {account.initials}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="caption"
                        noWrap
                        sx={{ display: "block", fontWeight: 650 }}
                      >
                        {account.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        sx={{ display: "block", fontSize: 11 }}
                      >
                        {account.domain}
                      </Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell className="account-plan">
                  <Typography variant="caption">{account.plan}</Typography>
                </TableCell>
                <TableCell className="account-status">
                  <Chip
                    label={account.status}
                    size="small"
                    color={
                      account.status === "Active" ? "primary" : "secondary"
                    }
                    variant="outlined"
                    sx={{ height: 20, fontSize: 11, fontWeight: 700 }}
                  />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {account.revenue}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TeamActivityCard() {
  return (
    <Card
      component="aside"
      data-preview-activity="team"
      variant="outlined"
      aria-labelledby="team-activity-title"
      sx={{ minWidth: 0, borderRadius: 2.5, bgcolor: "background.paper" }}
    >
      <CardContent sx={{ p: "14px !important" }}>
        <Stack
          direction="row"
          sx={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <Box>
            <Typography id="team-activity-title" variant="subtitle2">
              Team activity
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Today
            </Typography>
          </Box>
          <Chip
            label="Live"
            color="primary"
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: 11, fontWeight: 700 }}
          />
        </Stack>
        <Stack divider={<Divider flexItem />} spacing={1.15} sx={{ mt: 1.45 }}>
          {TEAM_ACTIVITY.map((activity) => (
            <Stack
              key={activity.summary}
              direction="row"
              spacing={0.9}
              sx={{ pb: 1.15, alignItems: "flex-start" }}
            >
              <Avatar
                sx={{
                  width: 27,
                  height: 27,
                  flex: "none",
                  bgcolor: `${activity.tone}.main`,
                  color: `${activity.tone}.contrastText`,
                  fontSize: 11,
                  fontWeight: 750,
                }}
              >
                {activity.initials}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="caption"
                  sx={{ display: "block", lineHeight: 1.35, fontWeight: 650 }}
                >
                  {activity.summary}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.15, fontSize: 11 }}
                >
                  {activity.time}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function ProductDashboard() {
  return (
    <Box
      sx={{
        containerName: "muiPreview",
        containerType: "inline-size",
        bgcolor: "background.default",
        color: "text.primary",
      }}
    >
      <Box
        className="mui-dashboard-shell"
        data-preview="mui-dashboard"
        sx={{
          display: "grid",
          minHeight: 720,
          maxWidth: "100%",
          gridTemplateColumns: "164px minmax(0, 1fr)",
          overflow: "hidden",
          border: 1,
          borderColor: "divider",
          borderRadius: 3,
          bgcolor: "background.default",
          color: "text.primary",
          boxShadow: "0 18px 45px rgb(0 0 0 / 0.12)",
          "& *, & *::before, & *::after": { boxSizing: "border-box" },
          "@container muiPreview (max-width: 760px)": {
            gridTemplateColumns: "120px minmax(0, 1fr)",
            "& .mui-dashboard-breadcrumbs": { display: "none" },
          },
          "@container muiPreview (max-width: 479px)": {
            gridTemplateColumns: "minmax(0, 1fr)",
            "& .mui-dashboard-sidebar": { display: "none" },
          },
          "@container muiPreview (max-width: 390px)": {
            "& .profile-copy, & .search-shortcut": { display: "none" },
            "& .mui-dashboard-title-row": {
              alignItems: "stretch",
              flexDirection: "column",
            },
            "& .mui-dashboard-page-actions": { width: "100%" },
            "& .MuiButton-root": { whiteSpace: "nowrap" },
          },
          "@container muiPreview (max-width: 320px)": {
            "& .mui-dashboard-page-actions": { flexDirection: "column" },
            "& .mui-dashboard-page-actions .MuiButton-root": { width: "100%" },
          },
        }}
      >
        <Navigation />
        <Box sx={{ minWidth: 0 }}>
          <WorkspaceHeader />
          <Box component="main" sx={{ p: 1.5 }}>
            <Stack
              className="mui-dashboard-title-row"
              direction="row"
              spacing={1.5}
              sx={{
                mb: 1.5,
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "flex", alignItems: "center", gap: 0.45 }}
                >
                  <IconGlyph path={ICON_PATHS.calendar} size="inherit" />
                  Tuesday, August 26
                </Typography>
                <Typography
                  component="h4"
                  sx={{
                    mt: 0.25,
                    fontSize: 21,
                    fontWeight: 760,
                    letterSpacing: "-0.035em",
                  }}
                >
                  Business overview
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.15, fontSize: 11 }}
                >
                  Monitor the signals that matter across your workspace.
                </Typography>
              </Box>
              <Stack
                className="mui-dashboard-page-actions"
                direction="row"
                spacing={0.75}
                sx={{ flex: "none", mt: 0.5 }}
              >
                <Button
                  variant="outlined"
                  size="small"
                  sx={{ whiteSpace: "nowrap" }}
                >
                  Export
                </Button>
                <Button
                  data-preview-cta="add-report"
                  variant="contained"
                  size="small"
                  startIcon={
                    <IconGlyph path={ICON_PATHS.plus} size="inherit" />
                  }
                  sx={{ whiteSpace: "nowrap" }}
                >
                  Add report
                </Button>
              </Stack>
            </Stack>

            <Box
              className="mui-dashboard-kpi-grid"
              sx={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 9rem), 1fr))",
                gap: 1,
              }}
            >
              {METRICS.map((metric) => (
                <MetricCard key={metric.label} metric={metric} />
              ))}
            </Box>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(min(100%, 18rem), 1.45fr) minmax(min(100%, 11rem), 0.75fr)",
                gap: 1,
                mt: 1,
                "@container muiPreview (max-width: 670px)": {
                  gridTemplateColumns: "minmax(0, 1fr)",
                },
              }}
            >
              <RevenueChart />
              <GoalCard />
            </Box>

            <Box
              className="mui-dashboard-bottom-grid"
              sx={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(min(100%, 23rem), 1.45fr) minmax(min(100%, 12rem), 0.75fr)",
                gap: 1,
                mt: 1,
                "@container muiPreview (max-width: 670px)": {
                  gridTemplateColumns: "minmax(0, 1fr)",
                },
              }}
            >
              <AccountTable />
              <TeamActivityCard />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export function MuiRuntimePreview({
  message,
  preview,
  updating,
}: {
  readonly message: ThemeUpdateMessage;
  readonly preview: JsonValue | undefined;
  readonly updating: boolean;
}) {
  const [colorSchemeNode, setColorSchemeNode] = useState<HTMLDivElement | null>(
    null,
  );
  const parsedPreview = safeParseMuiAdapterPreview(preview);
  const payload = parsedPreview.success ? parsedPreview.preview : undefined;
  const theme = useMemo(
    () =>
      payload === undefined
        ? undefined
        : createTheme(payload.themeOptions as ThemeOptions),
    [payload],
  );

  if (theme === undefined) {
    return (
      <section className="preview-panel preview-loading" role="alert">
        The MUI adapter returned an unsupported preview payload. Review compiler
        diagnostics.
      </section>
    );
  }

  return (
    <section
      className="preview-panel provider-preview-shell"
      aria-labelledby="mui-preview-title"
    >
      <div className="preview-heading">
        <div>
          <p className="eyebrow">Provider preview</p>
          <h3 id="mui-preview-title">Material UI runtime</h3>
        </div>
        <div className="status-pills" aria-label="Preview status">
          <span>{message.payload.target}</span>
          <span>{message.payload.profile}</span>
          <span>exact runtime</span>
          {updating ? <span>updating</span> : null}
        </div>
      </div>
      <div
        className="mui-color-scheme-scope"
        ref={setColorSchemeNode}
        inert
        aria-hidden="true"
      >
        {colorSchemeNode === null ? null : (
          <ColorSchemeThemeProvider
            key={message.payload.profile}
            theme={theme}
            defaultMode={message.payload.profile}
            colorSchemeNode={colorSchemeNode}
            storageManager={null}
            noSsr
          >
            <ProductDashboard />
          </ColorSchemeThemeProvider>
        )}
      </div>
      <p className="preview-disclaimer">
        Exact runtime: this dashboard and the downloaded module share the same
        createTheme options. The workbench installs no provider-wide CssBaseline
        or global reset.
      </p>
    </section>
  );
}
