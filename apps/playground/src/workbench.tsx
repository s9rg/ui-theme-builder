import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { strToU8, zipSync } from "fflate";
import { HarmonyControls, Picker } from "@s9rg/colorwheel/react";
import type { Palette } from "@s9rg/colorwheel/core";
import { safeParseCssAdapterPreview } from "@s9rg/theme-adapter-css";
import type { JsonValue } from "@s9rg/theme-compiler";
import {
  createThemeUpdateMessage,
  safeParsePreviewMessage,
} from "@s9rg/theme-demo-protocol";
import type {
  PreviewProfile,
  PreviewSemanticColors,
  ThemeUpdateMessage,
} from "@s9rg/theme-demo-protocol";
import { compileWorkbenchTheme } from "./compile-project";
import type { WorkbenchDiagnostic, WorkbenchFile } from "./compile-project";
import type { WorkbenchCompilation } from "./compile-project";
import {
  CheckIcon,
  CodeIcon,
  CopyIcon,
  DownloadIcon,
  GithubIcon,
  PaletteIcon,
  SlidersIcon,
} from "./icons";
import {
  cssColor,
  buildThemePalette,
  decorateTheoryPalette,
  getContrastChecks,
  INITIAL_MAPPINGS,
  INITIAL_THEORY_PALETTE,
  reconcileMappings,
  relationshipSummary,
  ROLE_LABELS,
  SEMANTIC_ROLES,
  SUPPORTING_COLORS,
  TARGETS,
  THEORY_MODES,
} from "./model";
import type {
  RoleMapping,
  SchemeMappings,
  SemanticRole,
  TargetKey,
} from "./model";

const MuiRuntimePreview = lazy(async () => {
  const module = await import("./mui-preview");
  return { default: module.MuiRuntimePreview };
});

const EMPTY_COMPILATION: WorkbenchCompilation = {
  ok: false,
  files: [],
  diagnostics: [],
  previews: {},
};

const RESULT_VIEWS = [
  { key: "preview", label: "Preview" },
  { key: "code", label: "Code" },
  { key: "diagnostics", label: "Diagnostics" },
] as const;

type ResultView = (typeof RESULT_VIEWS)[number]["key"];

function activateTabWithKeyboard<T>(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  items: readonly T[],
  activeIndex: number,
  activate: (item: T) => void,
): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  let nextIndex: number | undefined;
  switch (event.key) {
    case "ArrowLeft":
    case "ArrowUp":
      nextIndex = (activeIndex - 1 + items.length) % items.length;
      break;
    case "ArrowRight":
    case "ArrowDown":
      nextIndex = (activeIndex + 1) % items.length;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = items.length - 1;
      break;
    default:
      return;
  }

  const next = items[nextIndex];
  if (next === undefined) return;
  event.preventDefault();
  activate(next);
  event.currentTarget
    .closest('[role="tablist"]')
    ?.querySelectorAll<HTMLElement>('[role="tab"]')
    .item(nextIndex)
    .focus();
}

function TargetSelector({
  value,
  onChange,
}: {
  readonly value: TargetKey;
  readonly onChange: (value: TargetKey) => void;
}) {
  return (
    <fieldset className="target-picker">
      <legend className="visually-hidden">Available theme targets</legend>
      <div className="target-grid">
        {TARGETS.map((target) => (
          <label
            className="target-card"
            data-selected={value === target.key ? "" : undefined}
            key={target.key}
          >
            <input
              type="radio"
              name="target"
              value={target.key}
              checked={value === target.key}
              onChange={() => onChange(target.key)}
            />
            <span className="target-card-topline">
              <span className="target-name">{target.name}</span>
              <span className="artifact-hint">{target.artifactHint}</span>
            </span>
            <span className="target-profile">{target.profile}</span>
            <span className="target-description">{target.description}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function LibrarySelector({
  value,
  onChange,
}: {
  readonly value: TargetKey;
  readonly onChange: (value: TargetKey) => void;
}) {
  return (
    <section
      className="workbench-section library-step"
      aria-labelledby="library-title"
    >
      <div className="section-heading">
        <span className="section-icon">
          <CodeIcon />
        </span>
        <div>
          <p className="eyebrow">Step 2</p>
          <h2 id="library-title">Choose a library or format</h2>
          <p>
            Pick where the theme should go. The builder recompiles the same
            explicit palette for that target.
          </p>
        </div>
      </div>
      <TargetSelector value={value} onChange={onChange} />
    </section>
  );
}

function PaletteEditor({
  palette,
  mappingPalette,
  profile,
  mapping,
  onChange,
  onProfileChange,
  onRoleChange,
}: {
  readonly palette: Palette;
  readonly mappingPalette: Palette;
  readonly profile: PreviewProfile;
  readonly mapping: RoleMapping;
  readonly onChange: (palette: Palette) => void;
  readonly onProfileChange: (profile: PreviewProfile) => void;
  readonly onRoleChange: (role: SemanticRole, colorId: string) => void;
}) {
  return (
    <section
      className="workbench-section palette-editor"
      aria-labelledby="palette-title"
    >
      <div className="section-heading">
        <span className="section-icon">
          <PaletteIcon />
        </span>
        <div>
          <p className="eyebrow">Step 1</p>
          <h2 id="palette-title">Choose a seed color</h2>
          <p>
            Pick one color, then generate a connected palette using color
            theory.
          </p>
        </div>
      </div>
      <div className="picker-shell">
        <Picker.Root
          palette={palette}
          wheel={{
            interaction: "linked",
            wheelModel: "hsv",
            outputGamut: "srgb",
          }}
          onPaletteChange={(nextPalette) =>
            onChange(decorateTheoryPalette(nextPalette))
          }
          aria-label="Color theory palette builder"
        >
          <div className="theory-toolbar">
            <HarmonyControls modes={THEORY_MODES} label="Color relationship" />
            <div className="relationship-copy">
              <strong role="status" aria-live="polite">
                {relationshipSummary(palette)}
              </strong>
              <span>
                The seed stays editable; every companion moves with it.
              </span>
            </div>
          </div>
          <div className="picker-layout">
            <Picker.Wheel
              title="Seed color"
              description="Move the seed handle or use its exact value field. Linked companions regenerate automatically."
              showInstructions={false}
            />
            <Picker.Palette
              title="Generated brand colors"
              description="A theory-based seed and its linked companions."
              showName={false}
              showActions={false}
              allowAdd={false}
            />
          </div>
        </Picker.Root>
      </div>
      <p className="theory-note">
        Hue relationships organize brand colors; they do not guarantee contrast
        or aesthetic quality. Semantic pairs are checked in Step 3.
      </p>
      <details className="foundation-disclosure">
        <summary>
          <span>Supporting UI neutrals</span>
          <small>Slate foundation v1 · generated theme support</small>
        </summary>
        <div className="foundation-content">
          <p>
            Color theory supplies the brand colors. This curated, read-only
            foundation supplies canvas, surface, text, muted text, and borders.
          </p>
          <ul className="foundation-swatches" aria-label="Supporting colors">
            {SUPPORTING_COLORS.map((entry) => (
              <li key={entry.id}>
                <span
                  aria-hidden="true"
                  style={{
                    backgroundColor: cssColor(mappingPalette, entry.id),
                  }}
                />
                <span>{entry.name}</span>
                <code>{cssColor(mappingPalette, entry.id)}</code>
              </li>
            ))}
          </ul>
        </div>
      </details>
      <details className="mapping-disclosure">
        <summary>
          <span>Advanced: customize semantic roles</span>
          <small>Starter light and dark mappings are already applied.</small>
        </summary>
        <RoleMapper
          palette={mappingPalette}
          profile={profile}
          mapping={mapping}
          onProfileChange={onProfileChange}
          onRoleChange={onRoleChange}
        />
      </details>
    </section>
  );
}

function RoleMapper({
  palette,
  profile,
  mapping,
  onProfileChange,
  onRoleChange,
}: {
  readonly palette: Palette;
  readonly profile: PreviewProfile;
  readonly mapping: RoleMapping;
  readonly onProfileChange: (profile: PreviewProfile) => void;
  readonly onRoleChange: (role: SemanticRole, colorId: string) => void;
}) {
  const profiles = ["light", "dark"] as const;
  const activeProfileIndex = profiles.indexOf(profile);

  return (
    <div className="mapping-panel" aria-labelledby="mapping-title">
      <div className="section-heading compact">
        <span className="section-icon">
          <SlidersIcon />
        </span>
        <div>
          <p className="eyebrow">Advanced mapping</p>
          <h3 id="mapping-title">Bind semantic roles</h3>
          <p>
            The compiler receives the exact mapping below. Starter defaults can
            be overridden.
          </p>
        </div>
      </div>
      <div className="scheme-tabs" role="tablist" aria-label="Color scheme">
        {profiles.map((candidate) => (
          <button
            type="button"
            role="tab"
            id={`scheme-tab-${candidate}`}
            aria-controls="scheme-mapping-panel"
            aria-selected={candidate === profile}
            tabIndex={candidate === profile ? 0 : -1}
            className="scheme-tab"
            key={candidate}
            onClick={() => onProfileChange(candidate)}
            onKeyDown={(event) =>
              activateTabWithKeyboard(
                event,
                profiles,
                activeProfileIndex,
                onProfileChange,
              )
            }
          >
            {candidate === "light" ? "Light scheme" : "Dark scheme"}
          </button>
        ))}
      </div>
      <div
        id="scheme-mapping-panel"
        className="role-list"
        role="tabpanel"
        aria-labelledby={`scheme-tab-${profile}`}
      >
        {SEMANTIC_ROLES.map((role) => (
          <label className="role-row" key={role}>
            <span>
              <span className="role-label">{ROLE_LABELS[role]}</span>
              <span className="role-code">{role}</span>
            </span>
            <span className="role-select-wrap">
              <span
                className="role-swatch"
                style={{ backgroundColor: cssColor(palette, mapping[role]) }}
                aria-hidden="true"
              />
              <select
                value={mapping[role]}
                onChange={(event) =>
                  onRoleChange(role, event.currentTarget.value)
                }
                aria-label={`${ROLE_LABELS[role]} color for ${profile} scheme`}
              >
                {palette.colors.map((entry, index) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name?.trim() || `Color ${index + 1}`}
                  </option>
                ))}
              </select>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function isSafePreviewColor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    !/[;{}]|url\s*\(/i.test(value) &&
    (typeof CSS === "undefined" || CSS.supports("color", value))
  );
}

function cssPreviewColors(
  preview: JsonValue | undefined,
  profile: PreviewProfile,
): PreviewSemanticColors | undefined {
  const parsed = safeParseCssAdapterPreview(preview);
  if (!parsed.success) return undefined;
  const { prefix } = parsed.preview;
  const scheme = parsed.preview.schemes[profile];
  if (scheme === undefined) return undefined;

  const variable = (role: string): string | undefined => {
    const value = scheme[`--${prefix}-semantic-${role}`];
    return isSafePreviewColor(value) ? value : undefined;
  };
  const colors = {
    background: variable("background"),
    surface: variable("surface"),
    foreground: variable("foreground"),
    muted: variable("muted-foreground"),
    primary: variable("primary"),
    primaryText: variable("primary-foreground"),
    accent: variable("secondary"),
    accentText: variable("secondary-foreground"),
    border: variable("divider"),
  };
  return Object.values(colors).every(
    (value): value is string => value !== undefined,
  )
    ? (colors as PreviewSemanticColors)
    : undefined;
}

type PreviewIconName =
  | "analytics"
  | "bell"
  | "billing"
  | "chevron"
  | "customers"
  | "dashboard"
  | "reports"
  | "search"
  | "settings"
  | "team";

function PreviewIcon({ name }: { readonly name: PreviewIconName }) {
  const path = (() => {
    switch (name) {
      case "analytics":
        return <path d="M4 19V9m5 10V5m5 14v-7m5 7V3" />;
      case "bell":
        return (
          <>
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M10 21h4" />
          </>
        );
      case "billing":
        return (
          <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 10h18M7 15h3" />
          </>
        );
      case "chevron":
        return <path d="m9 18 6-6-6-6" />;
      case "customers":
        return (
          <>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </>
        );
      case "dashboard":
        return (
          <>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </>
        );
      case "reports":
        return (
          <>
            <path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
            <path d="M8 8h8M8 12h8M8 16h5" />
          </>
        );
      case "search":
        return (
          <>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </>
        );
      case "settings":
        return (
          <>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-1.5-1H2.5v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.5 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 18.9 9a1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1 .6Z" />
          </>
        );
      case "team":
        return (
          <>
            <circle cx="8" cy="8" r="3" />
            <circle cx="17" cy="8" r="3" />
            <path d="M2 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M14 15a4 4 0 0 1 8 3v2" />
          </>
        );
    }
  })();

  return (
    <svg
      className="preview-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

function NeutralPreview({
  message,
  compiledColors,
}: {
  readonly message: ThemeUpdateMessage;
  readonly compiledColors?: PreviewSemanticColors;
}) {
  const colors = compiledColors ?? message.payload.colors;
  const style = {
    "--preview-bg": colors.background,
    "--preview-surface": colors.surface,
    "--preview-fg": colors.foreground,
    "--preview-muted": colors.muted,
    "--preview-primary": colors.primary,
    "--preview-primary-text": colors.primaryText,
    "--preview-accent": colors.accent,
    "--preview-accent-text": colors.accentText,
    "--preview-border": colors.border,
  } as CSSProperties;

  return (
    <section className="preview-panel" aria-labelledby="preview-title">
      <div className="preview-heading">
        <div>
          <p className="eyebrow">Framework-neutral semantic preview</p>
          <h3 id="preview-title">A realistic analytics workspace</h3>
        </div>
        <div className="status-pills" aria-label="Preview status">
          <span>{message.payload.target}</span>
          <span>{message.payload.profile}</span>
          <span>{message.payload.fidelity.replaceAll("-", " ")}</span>
        </div>
      </div>
      <div
        className="preview-stage"
        data-preview="neutral-dashboard"
        style={style}
        aria-hidden="true"
        inert
      >
        <aside className="preview-sidebar" aria-label="Preview navigation">
          <div className="preview-brand-lockup">
            <span className="preview-logo" aria-hidden="true">
              N
            </span>
            <span className="preview-brand-copy">
              <strong>Northstar</strong>
              <small>Growth workspace</small>
            </span>
          </div>
          <nav className="preview-navigation" aria-label="Workspace">
            <span className="preview-nav-label">Workspace</span>
            <span className="preview-nav-item active">
              <PreviewIcon name="dashboard" />
              <span>Overview</span>
            </span>
            <span className="preview-nav-item">
              <PreviewIcon name="analytics" />
              <span>Analytics</span>
              <small>8</small>
            </span>
            <span className="preview-nav-item">
              <PreviewIcon name="customers" />
              <span>Customers</span>
            </span>
            <span className="preview-nav-item">
              <PreviewIcon name="billing" />
              <span>Billing</span>
            </span>
            <span className="preview-nav-label preview-nav-label-secondary">
              Manage
            </span>
            <span className="preview-nav-item">
              <PreviewIcon name="team" />
              <span>Team</span>
            </span>
            <span className="preview-nav-item">
              <PreviewIcon name="reports" />
              <span>Reports</span>
            </span>
          </nav>
          <div className="preview-plan-card">
            <span className="preview-plan-icon">↗</span>
            <strong>Scale plan</strong>
            <small>18 of 25 seats used</small>
            <span className="preview-plan-track">
              <span />
            </span>
            <span className="preview-plan-link">
              Manage plan <PreviewIcon name="chevron" />
            </span>
          </div>
          <span className="preview-nav-item preview-settings-item">
            <PreviewIcon name="settings" />
            <span>Settings</span>
          </span>
        </aside>
        <div className="preview-app">
          <header className="preview-app-header">
            <div className="preview-breadcrumbs">
              <span>Northstar</span>
              <small>/</small>
              <strong>Overview</strong>
            </div>
            <label className="preview-search">
              <PreviewIcon name="search" />
              <span className="visually-hidden">Search workspace</span>
              <input type="search" placeholder="Search workspace…" readOnly />
              <kbd>⌘ K</kbd>
            </label>
            <div className="preview-account">
              <button
                type="button"
                className="preview-icon-button"
                aria-label="Notifications"
              >
                <PreviewIcon name="bell" />
                <span className="preview-notification-dot" />
              </button>
              <span className="preview-avatar">SK</span>
              <span className="preview-account-copy">
                <strong>Sam Kim</strong>
                <small>Admin</small>
              </span>
            </div>
          </header>
          <div className="preview-content">
            <div className="preview-title-row">
              <div>
                <span className="preview-kicker">Tuesday, August 26</span>
                <h3>Business overview</h3>
                <p>Monitor the signals that matter across your workspace.</p>
              </div>
              <div className="preview-page-actions">
                <button type="button" className="preview-secondary">
                  Export
                </button>
                <button
                  type="button"
                  className="preview-primary"
                  data-preview-cta="add-report"
                >
                  + Add report
                </button>
              </div>
            </div>
            <div className="preview-kpi-grid">
              <article
                className="preview-kpi-card"
                data-preview-kpi="monthly-revenue"
              >
                <div className="preview-kpi-topline">
                  <span>Monthly revenue</span>
                  <span className="preview-trend positive">↗ 12.8%</span>
                </div>
                <div className="preview-kpi-value">
                  <strong>$84.2k</strong>
                  <small>vs. $74.7k last month</small>
                </div>
                <svg
                  className="preview-sparkline primary"
                  viewBox="0 0 120 32"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d="M2 27C15 26 14 19 27 21s16 4 25-3 16-9 25-5 15-1 22-7 12-2 19-4" />
                </svg>
              </article>
              <article
                className="preview-kpi-card"
                data-preview-kpi="active-accounts"
              >
                <div className="preview-kpi-topline">
                  <span>Active accounts</span>
                  <span className="preview-trend positive">↗ 6.4%</span>
                </div>
                <div className="preview-kpi-value">
                  <strong>1,429</strong>
                  <small>86 joined this month</small>
                </div>
                <svg
                  className="preview-sparkline accent"
                  viewBox="0 0 120 32"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d="M2 24c10-1 13-9 24-8s16 9 27 5 13-11 25-9 17 9 24 3 7-8 16-9" />
                </svg>
              </article>
              <article
                className="preview-kpi-card"
                data-preview-kpi="customer-churn"
              >
                <div className="preview-kpi-topline">
                  <span>Customer churn</span>
                  <span className="preview-trend neutral">↘ 0.3%</span>
                </div>
                <div className="preview-kpi-value">
                  <strong>2.1%</strong>
                  <small>Below the 2.5% target</small>
                </div>
                <svg
                  className="preview-sparkline primary"
                  viewBox="0 0 120 32"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d="M2 6c9 2 13 8 23 7s14-6 23-2 14 10 24 8 13-8 24-5 13 8 22 11" />
                </svg>
              </article>
            </div>

            <div className="preview-insight-grid">
              <figure
                className="preview-revenue-card"
                data-preview-chart="revenue-performance"
              >
                <div className="preview-card-heading">
                  <div>
                    <strong>Revenue performance</strong>
                    <span>Net revenue across all channels</span>
                  </div>
                  <span className="preview-range-control">Last 8 months⌄</span>
                </div>
                <div className="preview-revenue-summary">
                  <strong>$476,290</strong>
                  <span className="preview-trend positive">+18.2%</span>
                  <small>vs. previous period</small>
                </div>
                <div className="preview-chart" aria-hidden="true">
                  <span className="preview-chart-line line-one" />
                  <span className="preview-chart-line line-two" />
                  <span className="preview-chart-line line-three" />
                  <div className="preview-chart-bars">
                    {[42, 54, 48, 67, 58, 76, 69, 88].map((height, index) => (
                      <span className="preview-chart-group" key={height}>
                        <span
                          className="preview-chart-bar primary"
                          style={{ height: `${height}%` }}
                        />
                        <span
                          className="preview-chart-bar accent"
                          style={{
                            height: `${Math.max(24, height - 18 + (index % 3) * 4)}%`,
                          }}
                        />
                      </span>
                    ))}
                  </div>
                </div>
                <div className="preview-chart-axis" aria-hidden="true">
                  <span>Jan</span>
                  <span>Feb</span>
                  <span>Mar</span>
                  <span>Apr</span>
                  <span>May</span>
                  <span>Jun</span>
                  <span>Jul</span>
                  <span>Aug</span>
                </div>
                <figcaption className="preview-chart-legend">
                  <span>
                    <i className="primary" /> Recurring
                  </span>
                  <span>
                    <i className="accent" /> Services
                  </span>
                </figcaption>
              </figure>

              <aside className="preview-goal-card">
                <div className="preview-card-heading">
                  <div>
                    <strong>Quarterly goal</strong>
                    <span>Q3 revenue target</span>
                  </div>
                  <span className="preview-more">•••</span>
                </div>
                <div className="preview-goal-ring">
                  <div>
                    <strong>78%</strong>
                    <small>complete</small>
                  </div>
                </div>
                <div className="preview-goal-copy">
                  <span>
                    <small>Current</small>
                    <strong>$476k</strong>
                  </span>
                  <span>
                    <small>Target</small>
                    <strong>$610k</strong>
                  </span>
                </div>
                <div className="preview-goal-note">
                  <span className="preview-status-dot" />
                  <span>
                    <strong>On track</strong>
                    <small>$44.7k needed per month</small>
                  </span>
                </div>
              </aside>
            </div>

            <div className="preview-bottom-grid">
              <section
                className="preview-accounts-card"
                data-preview-table="recent-accounts"
              >
                <div className="preview-card-heading">
                  <div>
                    <strong>Recent accounts</strong>
                    <span>Customers with new activity</span>
                  </div>
                  <button type="button" className="preview-text-button">
                    View all
                  </button>
                </div>
                <div className="preview-table-header">
                  <span>Customer</span>
                  <span>Plan</span>
                  <span>Status</span>
                  <span>Value</span>
                </div>
                <div className="preview-account-row">
                  <span className="preview-customer">
                    <i className="preview-company-logo one">AC</i>
                    <span>
                      <strong>Acme Studio</strong>
                      <small>acme.design</small>
                    </span>
                  </span>
                  <span>Scale</span>
                  <span className="preview-status success">Active</span>
                  <strong>$12,480</strong>
                </div>
                <div className="preview-account-row">
                  <span className="preview-customer">
                    <i className="preview-company-logo two">LR</i>
                    <span>
                      <strong>Linear Road</strong>
                      <small>linearroad.co</small>
                    </span>
                  </span>
                  <span>Pro</span>
                  <span className="preview-status review">Review</span>
                  <strong>$8,240</strong>
                </div>
                <div className="preview-account-row">
                  <span className="preview-customer">
                    <i className="preview-company-logo three">MK</i>
                    <span>
                      <strong>Monarch Labs</strong>
                      <small>monarch.io</small>
                    </span>
                  </span>
                  <span>Scale</span>
                  <span className="preview-status success">Active</span>
                  <strong>$6,940</strong>
                </div>
              </section>

              <aside className="preview-activity-card">
                <div className="preview-card-heading">
                  <div>
                    <strong>Team activity</strong>
                    <span>Today</span>
                  </div>
                  <span className="preview-live-pill">
                    <i /> Live
                  </span>
                </div>
                <div className="preview-activity-row">
                  <span className="preview-avatar small accent">JL</span>
                  <span>
                    <strong>Jamie published Q3 report</strong>
                    <small>8 minutes ago</small>
                  </span>
                </div>
                <div className="preview-activity-row">
                  <span className="preview-avatar small">MO</span>
                  <span>
                    <strong>Morgan added 4 accounts</strong>
                    <small>32 minutes ago</small>
                  </span>
                </div>
                <div className="preview-activity-row">
                  <span className="preview-avatar small muted">AK</span>
                  <span>
                    <strong>Alex updated the forecast</strong>
                    <small>1 hour ago</small>
                  </span>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
      <p className="preview-disclaimer">
        This preview renders the validated semantic payload, not the provider
        runtime. Generated source is shown below and is never evaluated in this
        page.
      </p>
    </section>
  );
}

function Diagnostics({
  compilerDiagnostics,
  palette,
  mapping,
}: {
  readonly compilerDiagnostics: readonly WorkbenchDiagnostic[];
  readonly palette: Palette;
  readonly mapping: RoleMapping;
}) {
  const contrastChecks = getContrastChecks(palette, mapping);
  const failureCount = contrastChecks.filter((check) => !check.pass).length;
  return (
    <section className="diagnostics" aria-labelledby="diagnostics-title">
      <div className="diagnostic-heading">
        <div>
          <p className="eyebrow">Diagnostics</p>
          <h3 id="diagnostics-title">
            {failureCount === 0 &&
            !compilerDiagnostics.some((item) => item.severity === "error")
              ? "Ready to inspect"
              : "Review before shipping"}
          </h3>
        </div>
        <span className="diagnostic-count">
          {contrastChecks.filter((item) => item.pass).length}/
          {contrastChecks.length} contrast pairs
        </span>
      </div>
      <ul className="diagnostic-list">
        {contrastChecks.map((check) => (
          <li key={check.label} data-severity={check.pass ? "info" : "warning"}>
            <span className="diagnostic-marker">
              {check.pass ? <CheckIcon /> : "!"}
            </span>
            <span>
              <strong>{check.label}</strong>
              <small>{check.ratio.toFixed(2)}:1 · WCAG AA normal text</small>
            </span>
          </li>
        ))}
        {compilerDiagnostics.map((diagnostic, index) => (
          <li
            key={`${diagnostic.code}-${index}`}
            data-severity={diagnostic.severity}
          >
            <span className="diagnostic-marker">
              {diagnostic.severity === "error" ? (
                "×"
              ) : diagnostic.severity === "warning" ? (
                "!"
              ) : (
                <CheckIcon />
              )}
            </span>
            <span>
              <strong>{diagnostic.code}</strong>
              <small>{diagnostic.message}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadThemeBundle(
  files: readonly WorkbenchFile[],
  targetKey: TargetKey,
): void {
  const entries = Object.fromEntries(
    files.map((file) => [file.path, strToU8(file.content)]),
  );
  const archive = zipSync(entries, { level: 6 });
  triggerDownload(
    new Blob([archive.slice().buffer], { type: "application/zip" }),
    `ui-theme-${targetKey}.zip`,
  );
}

function GeneratedFiles({
  files,
  targetName,
  compiling,
}: {
  readonly files: readonly WorkbenchFile[];
  readonly targetName: string;
  readonly compiling: boolean;
}) {
  const [requestedPath, setRequestedPath] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const active = files.find((file) => file.path === requestedPath) ?? files[0];
  const activeIndex = active === undefined ? -1 : files.indexOf(active);

  async function copyFile(file: WorkbenchFile): Promise<void> {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopyStatus(`${file.path} copied`);
    } catch {
      setCopyStatus("Copy failed. Select the code and copy it manually.");
    }
  }

  function downloadFile(file: WorkbenchFile): void {
    triggerDownload(
      new Blob([file.content], { type: file.mediaType }),
      file.path.split("/").at(-1) || "theme.txt",
    );
  }

  return (
    <section
      className="code-preview-panel"
      aria-labelledby="code-preview-title"
    >
      <div className="code-preview-heading">
        <div>
          <p className="eyebrow">Code preview</p>
          <h3 id="code-preview-title">
            {targetName} files
            {compiling ? (
              <span className="compiling-label">Updating…</span>
            ) : null}
          </h3>
          <p>Inspect or copy each deterministic source file.</p>
        </div>
      </div>
      {active === undefined ? (
        <div className="empty-output" role="status">
          No artifact was generated. Review the diagnostics above.
        </div>
      ) : (
        <div className="code-shell">
          <div className="code-toolbar">
            <div
              className="file-tabs"
              role="tablist"
              aria-label="Generated files"
            >
              {files.map((file, index) => (
                <button
                  type="button"
                  role="tab"
                  id={`generated-file-tab-${index}`}
                  aria-controls="generated-file-panel"
                  aria-selected={file.path === active.path}
                  tabIndex={file.path === active.path ? 0 : -1}
                  key={file.path}
                  onClick={() => setRequestedPath(file.path)}
                  onKeyDown={(event) =>
                    activateTabWithKeyboard(
                      event,
                      files,
                      activeIndex,
                      (candidate) => setRequestedPath(candidate.path),
                    )
                  }
                >
                  {file.path}
                </button>
              ))}
            </div>
            <div className="code-actions">
              <button type="button" onClick={() => void copyFile(active)}>
                <CopyIcon />
                Copy
              </button>
              <button type="button" onClick={() => downloadFile(active)}>
                <DownloadIcon />
                Download file
              </button>
            </div>
          </div>
          <div
            id="generated-file-panel"
            role="tabpanel"
            aria-labelledby={`generated-file-tab-${activeIndex}`}
          >
            <div className="code-meta">
              <span>{active.mediaType}</span>
              <span>{active.adapterId}</span>
            </div>
            <pre tabIndex={0} aria-label={`Generated ${active.path}`}>
              <code>{active.content}</code>
            </pre>
          </div>
        </div>
      )}
      <p className="visually-hidden" aria-live="polite">
        {copyStatus}
      </p>
    </section>
  );
}

function semanticColors(
  palette: Palette,
  mapping: RoleMapping,
): PreviewSemanticColors {
  return {
    background: cssColor(palette, mapping.background),
    surface: cssColor(palette, mapping.surface),
    foreground: cssColor(palette, mapping.foreground),
    muted: cssColor(palette, mapping.muted),
    primary: cssColor(palette, mapping.primary),
    primaryText: cssColor(palette, mapping.primaryText),
    accent: cssColor(palette, mapping.accent),
    accentText: cssColor(palette, mapping.accentText),
    border: cssColor(palette, mapping.border),
  };
}

export function Workbench() {
  const [theoryPalette, setTheoryPalette] = useState<Palette>(
    INITIAL_THEORY_PALETTE,
  );
  const [mappings, setMappings] = useState<SchemeMappings>(INITIAL_MAPPINGS);
  const [targetKey, setTargetKey] = useState<TargetKey>("css");
  const [profile, setProfile] = useState<PreviewProfile>("light");
  const [resultView, setResultView] = useState<ResultView>("preview");
  const [compileState, setCompileState] = useState<{
    readonly target: TargetKey | null;
    readonly requestKey: string | null;
    readonly result: WorkbenchCompilation;
  }>({ target: null, requestKey: null, result: EMPTY_COMPILATION });
  const target =
    TARGETS.find((candidate) => candidate.key === targetKey) ?? TARGETS[0]!;
  const palette = useMemo(
    () => buildThemePalette(theoryPalette),
    [theoryPalette],
  );
  const compileRequestKey = useMemo(
    () => JSON.stringify({ mappings, palette, targetKey }),
    [mappings, palette, targetKey],
  );

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void compileWorkbenchTheme(
        palette,
        mappings,
        targetKey,
        controller.signal,
      ).then((result) => {
        if (current && !controller.signal.aborted) {
          setCompileState({
            target: targetKey,
            requestKey: compileRequestKey,
            result,
          });
        }
      });
    }, 120);
    return () => {
      current = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [compileRequestKey, mappings, palette, targetKey]);

  const compilation =
    compileState.target === targetKey &&
    compileState.requestKey === compileRequestKey
      ? compileState.result
      : EMPTY_COMPILATION;
  const isCompiling = compileState.requestKey !== compileRequestKey;
  const previewResult = useMemo(() => {
    const message = createThemeUpdateMessage({
      requestId: `${target.adapterId}:${profile}`,
      target: target.adapterId,
      profile,
      fidelity: target.fidelity,
      colors: semanticColors(palette, mappings[profile]),
    });
    return safeParsePreviewMessage(message);
  }, [mappings, palette, profile, target]);
  const compiledCssColors =
    targetKey === "css" && !isCompiling
      ? cssPreviewColors(compilation.previews[target.adapterId], profile)
      : undefined;
  const activeResultViewIndex = RESULT_VIEWS.findIndex(
    (candidate) => candidate.key === resultView,
  );

  function updateRole(role: SemanticRole, colorId: string): void {
    setMappings((current) => ({
      ...current,
      [profile]: { ...current[profile], [role]: colorId },
    }));
  }

  function updateTheoryPalette(nextTheoryPalette: Palette): void {
    const decorated = decorateTheoryPalette(nextTheoryPalette);
    const nextPalette = buildThemePalette(decorated);
    setTheoryPalette(decorated);
    setMappings((current) => reconcileMappings(nextPalette, current));
  }

  const previewPanelContent =
    previewResult.success && previewResult.message.type === "theme.update" ? (
      targetKey === "mui" &&
      compilation.previews[target.adapterId] === undefined ? (
        <section className="preview-panel preview-loading" aria-busy="true">
          Compiling the MUI provider model…
        </section>
      ) : targetKey === "mui" ? (
        <Suspense
          fallback={
            <section className="preview-panel preview-loading" aria-busy="true">
              Loading the MUI runtime preview…
            </section>
          }
        >
          <MuiRuntimePreview
            message={previewResult.message}
            preview={compilation.previews[target.adapterId]}
            updating={isCompiling}
          />
        </Suspense>
      ) : (
        <NeutralPreview
          message={previewResult.message}
          {...(compiledCssColors === undefined
            ? {}
            : { compiledColors: compiledCssColors })}
        />
      )
    ) : (
      <section className="preview-panel">
        <p role="alert">Preview payload validation failed.</p>
      </section>
    );

  return (
    <div className="site-shell">
      <header className="site-header">
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          aria-label="UI Theme Builder home"
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>UI Theme Builder</span>
          <span className="alpha-badge">alpha</span>
        </a>
        <nav aria-label="Project links">
          <a href="https://github.com/s9rg/ui-theme-builder">
            <GithubIcon />
            GitHub
          </a>
        </nav>
      </header>

      <main id="workbench">
        <section className="hero" aria-labelledby="page-title">
          <p className="hero-kicker">One seed in. UI theme out.</p>
          <h1 id="page-title">Build a framework-ready theme in three steps.</h1>
          <p className="hero-copy">
            Choose one seed color and a color-theory relationship, select a
            library or format, then preview and download production-ready files.
          </p>
          <div className="hero-rule" />
          <ol className="journey-summary" aria-label="Builder steps">
            <li>
              <span>1</span>
              <strong>Choose a seed</strong>
              <small>Generate a theory-based palette.</small>
            </li>
            <li>
              <span>2</span>
              <strong>Choose a target</strong>
              <small>Pick a library or format.</small>
            </li>
            <li>
              <span>3</span>
              <strong>Preview and export</strong>
              <small>Inspect code and download.</small>
            </li>
          </ol>
        </section>

        <PaletteEditor
          palette={theoryPalette}
          mappingPalette={palette}
          profile={profile}
          mapping={mappings[profile]}
          onChange={updateTheoryPalette}
          onProfileChange={setProfile}
          onRoleChange={updateRole}
        />

        <LibrarySelector value={targetKey} onChange={setTargetKey} />

        <section
          className="workbench-section results-step"
          aria-labelledby="results-title"
          aria-busy={isCompiling}
        >
          <div className="section-heading results-heading">
            <span className="section-icon">
              <DownloadIcon />
            </span>
            <div>
              <p className="eyebrow">Step 3</p>
              <h2 id="results-title">Preview and export</h2>
              <p>
                Check the rendered theme and generated code, then download the
                complete {target.name} bundle.
              </p>
            </div>
            <button
              type="button"
              className="download-theme-button"
              disabled={isCompiling || compilation.files.length === 0}
              aria-describedby="result-status"
              onClick={() => downloadThemeBundle(compilation.files, targetKey)}
            >
              <DownloadIcon />
              Download theme
            </button>
          </div>

          <div className="result-toolbar">
            <div
              className="result-view-tabs"
              role="tablist"
              aria-label="Result view"
            >
              {RESULT_VIEWS.map((view) => (
                <button
                  type="button"
                  role="tab"
                  id={`result-view-tab-${view.key}`}
                  aria-controls={`result-view-panel-${view.key}`}
                  aria-selected={resultView === view.key}
                  tabIndex={resultView === view.key ? 0 : -1}
                  key={view.key}
                  onClick={() => setResultView(view.key)}
                  onKeyDown={(event) =>
                    activateTabWithKeyboard(
                      event,
                      RESULT_VIEWS,
                      activeResultViewIndex,
                      (candidate) => setResultView(candidate.key),
                    )
                  }
                >
                  {view.label}
                </button>
              ))}
            </div>
            <div className="result-utilities">
              <label className="preview-scheme-picker">
                <span>Preview scheme</span>
                <select
                  value={profile}
                  onChange={(event) =>
                    setProfile(event.currentTarget.value as PreviewProfile)
                  }
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <span id="result-status" className="result-status" role="status">
                {isCompiling
                  ? `Updating ${target.name}…`
                  : compilation.files.length > 0
                    ? `${compilation.files.length} files ready`
                    : "No files ready"}
              </span>
            </div>
          </div>

          <div
            id="result-view-panel-preview"
            className="result-view-panel"
            role="tabpanel"
            aria-labelledby="result-view-tab-preview"
            hidden={resultView !== "preview"}
          >
            {resultView === "preview" ? previewPanelContent : null}
          </div>
          <div
            id="result-view-panel-code"
            className="result-view-panel"
            role="tabpanel"
            aria-labelledby="result-view-tab-code"
            hidden={resultView !== "code"}
          >
            {resultView === "code" ? (
              <GeneratedFiles
                files={compilation.files}
                targetName={target.name}
                compiling={isCompiling}
              />
            ) : null}
          </div>
          <div
            id="result-view-panel-diagnostics"
            className="result-view-panel"
            role="tabpanel"
            aria-labelledby="result-view-tab-diagnostics"
            hidden={resultView !== "diagnostics"}
          >
            {resultView === "diagnostics" ? (
              <Diagnostics
                compilerDiagnostics={compilation.diagnostics}
                palette={palette}
                mapping={mappings[profile]}
              />
            ) : null}
          </div>
        </section>
      </main>

      <footer>
        <p>
          UI Theme Builder is powered by the deterministic Theme Compiler
          engine.
        </p>
        <p>
          Built with{" "}
          <a href="https://www.npmjs.com/package/@s9rg/colorwheel">
            @s9rg/colorwheel
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
