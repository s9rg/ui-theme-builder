import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

interface OpenWorkbenchResult {
  readonly runtimeErrors: string[];
}

const TARGET_CASES = [
  {
    key: "css",
    name: "CSS variables",
    accessibleName: /^CSS variables/,
    adapterId: "css@1",
    fidelity: "exact css variables",
    artifactPath: "theme.css",
    artifactCount: 2,
  },
  {
    key: "tailwind",
    name: "Tailwind",
    accessibleName: /^Tailwind/,
    adapterId: "tailwind@4",
    fidelity: "mapped preview",
    artifactPath: "theme.tailwind.css",
    artifactCount: 2,
  },
  {
    key: "mui",
    name: "Material UI",
    accessibleName: /^Material UI/,
    adapterId: "mui@9",
    fidelity: "exact runtime",
    artifactPath: "theme.ts",
    artifactCount: 2,
  },
  {
    key: "dtcg",
    name: "Design Tokens",
    accessibleName: /^Design Tokens/,
    adapterId: "dtcg@2025.10",
    fidelity: "mapped preview",
    artifactPath: "theme.primitives.tokens.json",
    artifactCount: 5,
  },
  {
    key: "antd",
    name: "Ant Design",
    accessibleName: /^Ant Design/,
    adapterId: "antd@6",
    fidelity: "mapped preview",
    artifactPath: "antd/theme.ts",
    artifactCount: 2,
  },
  {
    key: "shadcn",
    name: "shadcn/ui",
    accessibleName: /^shadcn\/ui/,
    adapterId: "shadcn@4",
    fidelity: "mapped preview",
    artifactPath: "shadcn/theme.json",
    artifactCount: 2,
  },
  {
    key: "daisyui",
    name: "daisyUI",
    accessibleName: /^daisyUI/,
    adapterId: "daisyui@5",
    fidelity: "mapped preview",
    artifactPath: "daisyui/theme.css",
    artifactCount: 2,
  },
  {
    key: "vuetify",
    name: "Vuetify",
    accessibleName: /^Vuetify/,
    adapterId: "vuetify@4",
    fidelity: "mapped preview",
    artifactPath: "vuetify.theme.ts",
    artifactCount: 2,
  },
  {
    key: "angular-material",
    name: "Angular Material",
    accessibleName: /^Angular Material/,
    adapterId: "angular-material@22",
    fidelity: "compile verified",
    artifactPath: "angular-material.theme.scss",
    artifactCount: 2,
  },
  {
    key: "ionic",
    name: "Ionic",
    accessibleName: /^Ionic/,
    adapterId: "ionic@9",
    fidelity: "mapped preview",
    artifactPath: "ionic.theme.css",
    artifactCount: 2,
  },
  {
    key: "react-native-paper",
    name: "React Native Paper",
    accessibleName: /^React Native Paper/,
    adapterId: "react-native-paper@5",
    fidelity: "native web approximation",
    artifactPath: "react-native-paper/theme.ts",
    artifactCount: 2,
  },
] as const;

async function openWorkbench(page: Page): Promise<OpenWorkbenchResult> {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    const type = message.type();
    if (type === "error" || type === "warning") {
      runtimeErrors.push(`${type}: ${message.text()}`);
    }
  });

  await page.goto("./");
  await expect(
    page.getByRole("heading", {
      name: "Build a framework-ready theme in three steps.",
    }),
  ).toBeVisible();
  await waitForCompilation(page, "CSS variables");
  return { runtimeErrors };
}

async function waitForCompilation(page: Page, targetName: string) {
  const results = page.locator('section[aria-labelledby="results-title"]');
  await expect(results).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#result-status")).toContainText(
    new RegExp(`files ready`),
  );
  await expect(page.locator("#result-status")).not.toContainText(
    `Updating ${targetName}`,
  );
}

type ResultViewName = "Preview" | "Code" | "Diagnostics";

async function selectResultView(page: Page, name: ResultViewName) {
  const tab = page.getByRole("tab", { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  const panelId = await tab.getAttribute("aria-controls");
  const tabId = await tab.getAttribute("id");
  if (panelId === null || tabId === null)
    throw new Error(`${name} result tab is missing its APG relationship`);
  const panel = page.locator(`#${panelId}`);
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("aria-labelledby", tabId);
  return panel;
}

async function openGeneratedCode(page: Page, targetName: string) {
  const panel = await selectResultView(page, "Code");
  await expect(
    panel.getByRole("heading", { name: `${targetName} files` }),
  ).toBeVisible();
  return panel;
}

async function expectRealisticStory(
  page: Page,
  stageSelector: string,
  inertHostSelector: string,
) {
  const stage = page.locator(stageSelector);
  await expect(stage).toBeVisible();
  await expect(stage.locator("[data-preview-kpi]")).toHaveCount(3);
  await expect(
    stage.locator('[data-preview-chart="revenue-performance"]'),
  ).toHaveCount(1);
  await expect(
    stage.locator('[data-preview-table="recent-accounts"]'),
  ).toHaveCount(1);
  await expect(stage.locator('[data-preview-cta="add-report"]')).toHaveCount(1);
  await expect(
    stage.getByText("Business overview", { exact: true }),
  ).toBeAttached();
  await expect(
    stage.getByText("Recent accounts", { exact: true }),
  ).toBeAttached();

  const accountRows = stage.locator(
    '[data-preview-table="recent-accounts"] .preview-account-row, [data-preview-table="recent-accounts"] tbody tr',
  );
  await expect(accountRows).toHaveCount(3);

  const geometry = await stage.evaluate((element) => {
    const panel = element.closest(".result-view-panel");
    if (!(panel instanceof HTMLElement))
      throw new Error("Result view panel was not found");
    const stageRect = element.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    return {
      panelWidth: panelRect.width,
      stageWidth: stageRect.width,
    };
  });
  expect(geometry.stageWidth).toBeGreaterThan(700);
  expect(geometry.stageWidth / geometry.panelWidth).toBeGreaterThan(0.9);

  const inertHost = page.locator(inertHostSelector);
  await expect(inertHost).toHaveAttribute("inert", "");
  await expect(inertHost).toHaveAttribute("aria-hidden", "true");
  const focusResults = await inertHost
    .locator("button, input, select, textarea, a[href]")
    .evaluateAll((elements) =>
      elements.map((element) => {
        if (!(element instanceof HTMLElement)) return false;
        element.focus();
        return document.activeElement === element;
      }),
    );
  expect(focusResults.length).toBeGreaterThan(0);
  expect(focusResults).not.toContain(true);
}

async function expectCompactStory(page: Page, stageSelector: string) {
  const stage = page.locator(stageSelector);
  await expect(stage).toBeVisible();
  await expect(stage.locator("[data-preview-kpi]")).toHaveCount(3);

  const geometry = await stage.evaluate((element) => {
    const stageRect = element.getBoundingClientRect();
    const tracked = Array.from(
      element.querySelectorAll<HTMLElement>(
        "[data-preview-kpi], [data-preview-chart], [data-preview-table], [data-preview-cta]",
      ),
    );
    const escaped = tracked
      .map((item) => {
        const rect = item.getBoundingClientRect();
        return {
          hook:
            item.getAttribute("data-preview-kpi") ??
            item.getAttribute("data-preview-chart") ??
            item.getAttribute("data-preview-table") ??
            item.getAttribute("data-preview-cta") ??
            item.tagName,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          top: rect.top,
        };
      })
      .filter(
        (rect) =>
          rect.left < stageRect.left - 1 ||
          rect.right > stageRect.right + 1 ||
          rect.top < stageRect.top - 1 ||
          rect.bottom > stageRect.bottom + 1,
      );
    const kpis = Array.from(
      element.querySelectorAll<HTMLElement>("[data-preview-kpi]"),
      (item) => {
        const rect = item.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          left: rect.left,
          top: rect.top,
          width: rect.width,
        };
      },
    );
    const buttons = Array.from(
      element.querySelectorAll<HTMLButtonElement>("button"),
    )
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          Boolean(button.textContent?.trim())
        );
      })
      .map((button) => ({
        label: button.textContent?.trim() ?? "",
        clientWidth: button.clientWidth,
        scrollWidth: button.scrollWidth,
        whiteSpace: getComputedStyle(button).whiteSpace,
      }));
    return {
      buttons,
      clientWidth: element.clientWidth,
      escaped,
      kpis,
      scrollWidth: element.scrollWidth,
    };
  });

  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.escaped).toEqual([]);
  expect(geometry.kpis).toHaveLength(3);
  for (const kpi of geometry.kpis) expect(kpi.width).toBeGreaterThan(230);
  expect(geometry.kpis[1]!.top).toBeGreaterThanOrEqual(
    geometry.kpis[0]!.bottom - 1,
  );
  expect(geometry.kpis[2]!.top).toBeGreaterThanOrEqual(
    geometry.kpis[1]!.bottom - 1,
  );
  expect(geometry.buttons.length).toBeGreaterThan(0);
  for (const button of geometry.buttons) {
    expect(button.whiteSpace, `${button.label} should stay on one line`).toBe(
      "nowrap",
    );
    expect(
      button.scrollWidth,
      `${button.label} should fit its button`,
    ).toBeLessThanOrEqual(button.clientWidth + 1);
  }
}

async function selectTarget(page: Page, accessibleName: RegExp) {
  await page.getByRole("radio", { name: accessibleName }).check();
}

async function observeDownloadAvailability(page: Page): Promise<void> {
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "Download theme",
    );
    if (!(button instanceof HTMLButtonElement))
      throw new Error("Download theme button was not found");
    const states = [button.disabled];
    new MutationObserver(() => states.push(button.disabled)).observe(button, {
      attributes: true,
      attributeFilter: ["disabled"],
    });
    (
      globalThis as unknown as { __downloadDisabledStates?: boolean[] }
    ).__downloadDisabledStates = states;
  });
}

async function downloadWasDisabled(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      (
        globalThis as unknown as { __downloadDisabledStates?: boolean[] }
      ).__downloadDisabledStates?.includes(true) ?? false,
  );
}

test("presents the builder in color, target, then preview order", async ({
  page,
}) => {
  const { runtimeErrors } = await openWorkbench(page);
  const headings = [
    page.getByRole("heading", { name: "Choose a seed color" }),
    page.getByRole("heading", { name: "Choose a library or format" }),
    page.getByRole("heading", { name: "Preview and export" }),
  ];

  for (const heading of headings) await expect(heading).toBeVisible();
  const targetCards = page.locator(".target-card");
  await expect(targetCards).toHaveCount(TARGET_CASES.length);
  expect(await targetCards.locator(".target-name").allTextContents()).toEqual(
    TARGET_CASES.map((target) => target.name),
  );
  for (const target of TARGET_CASES) {
    await expect(
      page.getByRole("radio", { name: target.accessibleName }),
    ).toBeVisible();
  }
  const ordered = await page.evaluate(() => {
    const elements = ["palette-title", "library-title", "results-title"].map(
      (id) => document.getElementById(id),
    );
    if (elements.some((element) => element === null)) return false;
    return elements.slice(0, -1).every((element, index) => {
      const next = elements[index + 1]!;
      return Boolean(
        element!.compareDocumentPosition(next) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
  });
  expect(ordered).toBe(true);
  const downloadTheme = page.getByRole("button", { name: "Download theme" });
  await expect(page.getByRole("tab", { name: "Preview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#result-view-panel-preview")).toBeVisible();
  await expect(page.locator("#result-view-panel-code")).toBeHidden();
  await expect(page.locator("#result-view-panel-diagnostics")).toBeHidden();
  for (const view of ["Code", "Diagnostics", "Preview"] as const) {
    await selectResultView(page, view);
    await expect(downloadTheme).toBeEnabled();
  }
  expect(runtimeErrors).toEqual([]);
});

test.describe("target generator matrix", () => {
  for (const target of TARGET_CASES) {
    test(`${target.name} compiles, previews, shows code, and downloads`, async ({
      page,
    }) => {
      const { runtimeErrors } = await openWorkbench(page);
      const targetRadio = page.getByRole("radio", {
        name: target.accessibleName,
      });

      if (target.key === "css") {
        await expect(targetRadio).toBeChecked();
      } else {
        await observeDownloadAvailability(page);
        await targetRadio.check();
        await waitForCompilation(page, target.name);
        expect(await downloadWasDisabled(page)).toBe(true);
      }

      await expect(targetRadio).toBeChecked();
      await expect(
        page.getByRole("button", { name: "Download theme" }),
      ).toBeEnabled();

      const previewStatus = page.getByLabel("Preview status");
      await expect(previewStatus).toContainText(target.adapterId);
      await expect(previewStatus).toContainText(target.fidelity);
      if (target.key === "mui") {
        await expect(
          page.getByRole("heading", { name: "Material UI runtime" }),
        ).toBeVisible();
      } else {
        await expect(
          page.getByRole("heading", {
            name: "A realistic analytics workspace",
          }),
        ).toBeVisible();
        await expect(page.locator(".preview-disclaimer")).toContainText(
          "not the provider runtime",
        );
      }

      const codePanel = await openGeneratedCode(page, target.name);
      const artifactTab = codePanel.getByRole("tab", {
        name: target.artifactPath,
        exact: true,
      });
      await expect(artifactTab).toBeVisible();
      await artifactTab.click();
      await expect(
        codePanel.getByLabel(`Generated ${target.artifactPath}`, {
          exact: true,
        }),
      ).toContainText(/\S/);
      await expect(
        codePanel.getByRole("tab", { name: "theme.lock.json", exact: true }),
      ).toBeVisible();
      if (target.key !== "css") {
        await expect(
          codePanel.getByRole("tab", { name: "theme.css", exact: true }),
        ).toHaveCount(0);
      }

      const bundleDownloadPromise = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download theme", exact: true })
        .click();
      const bundleDownload = await bundleDownloadPromise;
      expect(bundleDownload.suggestedFilename()).toBe(
        `ui-theme-${target.key}.zip`,
      );
      const bundlePath = await bundleDownload.path();
      expect(bundlePath).not.toBeNull();
      const bundle = unzipSync(new Uint8Array(await readFile(bundlePath)));
      expect(Object.keys(bundle)).toHaveLength(target.artifactCount);
      expect(Object.keys(bundle)).toEqual(
        expect.arrayContaining([target.artifactPath, "theme.lock.json"]),
      );
      expect(runtimeErrors).toEqual([]);
    });
  }
});

test("renders full-width realistic CSS and MUI stories without focusable demo controls", async ({
  page,
}) => {
  const { runtimeErrors } = await openWorkbench(page);

  await expectRealisticStory(
    page,
    '[data-preview="neutral-dashboard"]',
    '[data-preview="neutral-dashboard"]',
  );
  const neutralStage = page.locator('[data-preview="neutral-dashboard"]');
  const neutralCard = neutralStage.locator(
    '[data-preview-kpi="monthly-revenue"]',
  );
  const lightNeutralColors = await Promise.all([
    neutralStage.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
    neutralCard.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ]);
  await page.getByLabel("Preview scheme").selectOption("dark");
  await expect
    .poll(() =>
      neutralStage.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .not.toBe(lightNeutralColors[0]);
  await expect
    .poll(() =>
      neutralCard.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .not.toBe(lightNeutralColors[1]);

  await selectTarget(page, /^Material UI/);
  await waitForCompilation(page, "Material UI");
  await expect(
    page.getByRole("heading", { name: "Material UI runtime" }),
  ).toBeVisible();
  await expectRealisticStory(
    page,
    '[data-preview="mui-dashboard"]',
    ".mui-color-scheme-scope",
  );
  const muiStage = page.locator('[data-preview="mui-dashboard"]');
  await expect(muiStage.locator(".MuiCard-root")).toHaveCount(8);
  await expect(muiStage.locator(".MuiButton-contained")).toHaveCount(1);
  await expect(muiStage.locator(".MuiTable-root")).toHaveCount(1);
  expect(runtimeErrors).toEqual([]);
});

test("compiles deterministic CSS artifacts and downloads the complete theme", async ({
  page,
}) => {
  const { runtimeErrors } = await openWorkbench(page);

  await expect(page.locator(".preview-stage")).toHaveAttribute(
    "style",
    /--preview-primary:\s*color\(srgb 0\.745098 0\.070588 0\.235294\)/,
  );
  const codePanel = await openGeneratedCode(page, "CSS variables");
  const cssSource = codePanel.getByLabel("Generated theme.css", {
    exact: true,
  });

  await expect(cssSource).toContainText(
    "--theme-palette-brand: color(srgb 0.745098 0.070588 0.235294);",
  );
  await expect(cssSource).toContainText(
    "--theme-semantic-primary: color(srgb 0.745098 0.070588 0.235294);",
  );
  await expect(cssSource).toContainText('[data-theme="dark"]');

  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(
    page.getByText("theme.css copied", { exact: true }),
  ).toBeAttached();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(
      "--theme-palette-brand: color(srgb 0.745098 0.070588 0.235294);",
    );

  const fileDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download file", exact: true })
    .click();
  expect((await fileDownloadPromise).suggestedFilename()).toBe("theme.css");

  const bundleDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download theme", exact: true })
    .click();
  const bundleDownload = await bundleDownloadPromise;
  expect(bundleDownload.suggestedFilename()).toBe("ui-theme-css.zip");
  const bundlePath = await bundleDownload.path();
  expect(bundlePath).not.toBeNull();
  const bundle = unzipSync(new Uint8Array(await readFile(bundlePath)));
  expect(Object.keys(bundle).sort()).toEqual(["theme.css", "theme.lock.json"]);

  await page.getByRole("tab", { name: "theme.lock.json" }).click();
  const lockSource = await page
    .getByLabel("Generated theme.lock.json", { exact: true })
    .textContent();
  const lock: unknown = JSON.parse(lockSource ?? "");
  expect(lock).toMatchObject({
    project: { id: "workbench-theme" },
    schemaVersion: "1.0",
  });
  expect(runtimeErrors).toEqual([]);
});

test("renders the compiled MUI theme through the real light and dark runtime", async ({
  page,
}) => {
  const { runtimeErrors } = await openWorkbench(page);
  await selectTarget(page, /^Material UI/);
  await waitForCompilation(page, "Material UI");

  await expect(
    page.getByRole("heading", { name: "Material UI runtime" }),
  ).toBeVisible();

  const runtimeSurface = page.locator('[data-preview="mui-dashboard"]');
  const runtimeCard = runtimeSurface.locator(
    '[data-preview-kpi="monthly-revenue"]',
  );
  const lightColors = await Promise.all([
    runtimeSurface.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
    runtimeCard.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ]);

  await page.getByLabel("Preview scheme").selectOption("dark");
  await expect
    .poll(() =>
      runtimeSurface.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .not.toBe(lightColors[0]);
  await expect
    .poll(() =>
      runtimeCard.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .not.toBe(lightColors[1]);
  await expect(page.getByText("dark", { exact: true })).toBeVisible();
  await openGeneratedCode(page, "Material UI");
  await expect(page.getByRole("tab", { name: "theme.ts" })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("recompiles palette edits while preserving stable primitive IDs", async ({
  page,
}) => {
  const { runtimeErrors } = await openWorkbench(page);
  const seedValue = page.getByRole("textbox", { name: "Seed value" });
  await openGeneratedCode(page, "CSS variables");
  const cssSource = page.getByLabel("Generated theme.css", { exact: true });
  const initialAccent = await cssSource
    .textContent()
    .then((value) => value?.match(/--theme-palette-accent:[^;]+;/)?.[0]);

  await selectResultView(page, "Preview");

  await seedValue.fill("#ff006e");
  await seedValue.press("Enter");
  await waitForCompilation(page, "CSS variables");

  await expect(page.locator('[data-preview-cta="add-report"]')).toHaveCSS(
    "background-color",
    "color(srgb 1 0 0.431373)",
  );
  await openGeneratedCode(page, "CSS variables");
  await expect(cssSource).toContainText(
    "--theme-palette-brand: color(srgb 1 0 0.431373);",
  );
  await expect(cssSource).toContainText("--theme-palette-accent:");
  expect(
    (await cssSource.textContent())?.match(
      /--theme-palette-accent:[^;]+;/,
    )?.[0],
  ).not.toBe(initialAccent);
  expect(runtimeErrors).toEqual([]);
});

test("generates explicit color-theory relationships from one seed", async ({
  page,
}) => {
  const { runtimeErrors } = await openWorkbench(page);
  const relationship = page.getByLabel("Color relationship");
  const paletteItems = page.locator('[data-part="palette-item"]');

  await expect(relationship).toHaveValue("complementary");
  await expect(relationship.locator("option")).toHaveCount(6);
  await expect(relationship.locator('option[value="tonal"]')).toHaveCount(0);
  await expect(relationship.locator('option[value="single"]')).toHaveCount(0);
  await expect(paletteItems).toHaveCount(2);
  await expect(page.getByText("180° apart", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /Add color/i })).toHaveCount(0);
  const codePanel = await openGeneratedCode(page, "CSS variables");
  const cssSource = codePanel.getByLabel("Generated theme.css", {
    exact: true,
  });

  await relationship.selectOption("triadic");
  await expect(paletteItems).toHaveCount(3);
  await expect(page.getByText("120° apart", { exact: false })).toBeVisible();
  await waitForCompilation(page, "CSS variables");
  await expect(cssSource).toContainText("--theme-palette-generated-color-1:");

  await relationship.selectOption("monochromatic");
  await expect(paletteItems).toHaveCount(5);
  await expect(page.getByText("one hue", { exact: false })).toBeVisible();
  await waitForCompilation(page, "CSS variables");

  await page
    .locator("summary")
    .filter({ hasText: "Advanced: customize semantic roles" })
    .click();
  const lightAccent = page.getByLabel("Accent color for light scheme", {
    exact: true,
  });
  await lightAccent.selectOption("generated-color-1");
  await waitForCompilation(page, "CSS variables");

  await relationship.selectOption("complementary");
  await expect(paletteItems).toHaveCount(2);
  await expect(lightAccent).toHaveValue("accent");
  await waitForCompilation(page, "CSS variables");
  await expect(cssSource).not.toContainText(
    "--theme-palette-generated-color-1:",
  );
  expect(runtimeErrors).toEqual([]);
});

test("clears stale generated files when switching adapters", async ({
  page,
}) => {
  const { runtimeErrors } = await openWorkbench(page);
  await openGeneratedCode(page, "CSS variables");

  await observeDownloadAvailability(page);
  await selectTarget(page, /^Material UI/);
  await waitForCompilation(page, "Material UI");
  expect(await downloadWasDisabled(page)).toBe(true);
  await expect(page.getByRole("tab", { name: "theme.ts" })).toBeVisible();

  await observeDownloadAvailability(page);
  await selectTarget(page, /^CSS variables/);
  await waitForCompilation(page, "CSS variables");
  expect(await downloadWasDisabled(page)).toBe(true);
  await expect(page.getByRole("tab", { name: "theme.css" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "theme.ts" })).toHaveCount(0);
  await expect(
    page.getByLabel("Generated theme.css", { exact: true }),
  ).not.toContainText("createTheme");
  expect(runtimeErrors).toEqual([]);
});

test("supports keyboard target selection and recompiles the result", async ({
  page,
}) => {
  const { runtimeErrors } = await openWorkbench(page);
  const cssTarget = page.getByRole("radio", { name: /^CSS variables/ });
  const tailwindTarget = page.getByRole("radio", { name: /^Tailwind/ });
  await openGeneratedCode(page, "CSS variables");

  await observeDownloadAvailability(page);
  await cssTarget.focus();
  await cssTarget.press("ArrowRight");
  await expect(tailwindTarget).toBeFocused();
  await expect(tailwindTarget).toBeChecked();
  await waitForCompilation(page, "Tailwind");
  expect(await downloadWasDisabled(page)).toBe(true);
  await expect(
    page.getByRole("tab", { name: "theme.tailwind.css" }),
  ).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("supports APG keyboard navigation for result, scheme, and file tabs", async ({
  page,
}) => {
  const { runtimeErrors } = await openWorkbench(page);
  await page
    .locator("summary")
    .filter({ hasText: "Advanced: customize semantic roles" })
    .click();
  const light = page.getByRole("tab", { name: "Light scheme" });
  const dark = page.getByRole("tab", { name: "Dark scheme" });

  await light.focus();
  await light.press("ArrowRight");
  await expect(dark).toBeFocused();
  await expect(dark).toHaveAttribute("aria-selected", "true");
  await expect(dark).toHaveAttribute("aria-controls", "scheme-mapping-panel");
  await expect(
    page.getByRole("tabpanel", { name: "Dark scheme" }),
  ).toBeVisible();

  const previewView = page.getByRole("tab", {
    name: "Preview",
    exact: true,
  });
  const codeView = page.getByRole("tab", { name: "Code", exact: true });
  const diagnosticsView = page.getByRole("tab", {
    name: "Diagnostics",
    exact: true,
  });

  await previewView.focus();
  await previewView.press("ArrowRight");
  await expect(codeView).toBeFocused();
  await expect(codeView).toHaveAttribute("aria-selected", "true");
  await expect(codeView).toHaveAttribute(
    "aria-controls",
    "result-view-panel-code",
  );
  await expect(
    page.getByRole("tabpanel", { name: "Code", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#result-view-panel-preview")).toBeHidden();

  await codeView.press("End");
  await expect(diagnosticsView).toBeFocused();
  await expect(diagnosticsView).toHaveAttribute("aria-selected", "true");
  await expect(diagnosticsView).toHaveAttribute(
    "aria-controls",
    "result-view-panel-diagnostics",
  );
  await expect(
    page.getByRole("tabpanel", { name: "Diagnostics", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download theme" }),
  ).toBeEnabled();

  await diagnosticsView.press("Home");
  await expect(previewView).toBeFocused();
  await expect(previewView).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#result-view-panel-preview")).toBeVisible();
  await previewView.press("ArrowRight");
  await expect(codeView).toHaveAttribute("aria-selected", "true");

  const cssFile = page.getByRole("tab", { name: "theme.css" });
  const lockFile = page.getByRole("tab", { name: "theme.lock.json" });
  await cssFile.focus();
  await cssFile.press("End");
  await expect(lockFile).toBeFocused();
  await expect(lockFile).toHaveAttribute("aria-selected", "true");
  await lockFile.press("Home");
  await expect(cssFile).toBeFocused();
  await expect(cssFile).toHaveAttribute("aria-selected", "true");
  expect(runtimeErrors).toEqual([]);
});

test("has no automated accessibility violations in the workbench", async ({
  page,
}) => {
  const { runtimeErrors } = await openWorkbench(page);

  const structuralScan = await new AxeBuilder({ page })
    .include("body")
    // Compiled preview colors are intentionally user-authored and are reported by the
    // product's own contrast diagnostics. Keep the full-page structural gate stable.
    .disableRules(["color-contrast"])
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(structuralScan.violations).toEqual([]);

  const interfaceContrastScan = await new AxeBuilder({ page })
    .include(".site-shell")
    .exclude(".preview-panel")
    .withRules(["color-contrast"])
    .analyze();
  expect(interfaceContrastScan.violations).toEqual([]);

  await page
    .locator("summary")
    .filter({ hasText: "Advanced: customize semantic roles" })
    .click();
  await selectTarget(page, /^Material UI/);
  await waitForCompilation(page, "Material UI");
  const muiStructuralScan = await new AxeBuilder({ page })
    .include("body")
    .disableRules(["color-contrast"])
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(muiStructuralScan.violations).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test("fits the complete workbench at a 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { runtimeErrors } = await openWorkbench(page);
  await page.getByLabel("Color relationship").selectOption("monochromatic");
  await expect(page.locator('[data-part="palette-item"]')).toHaveCount(5);
  await waitForCompilation(page, "CSS variables");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(
    page.getByRole("heading", { name: "Choose a seed color" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Choose a library or format" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Preview and export" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download theme" }),
  ).toBeVisible();
  await expectCompactStory(page, '[data-preview="neutral-dashboard"]');

  await selectTarget(page, /^Material UI/);
  await waitForCompilation(page, "Material UI");
  await expect(
    page.getByRole("heading", { name: "Material UI runtime" }),
  ).toBeVisible();
  await expectCompactStory(page, '[data-preview="mui-dashboard"]');
  const muiDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(muiDimensions.scrollWidth).toBeLessThanOrEqual(
    muiDimensions.clientWidth,
  );
  expect(runtimeErrors).toEqual([]);
});
