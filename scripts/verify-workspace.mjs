import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const packageRoot = path.join(root, "packages");
const rootManifest = await readJson(path.join(root, "package.json"));
const lockfile = await readJson(path.join(root, "package-lock.json"));
const forbiddenRuntimePackages = new Set([
  "@angular/material",
  "@chakra-ui/react",
  "@ionic/core",
  "@material/material-color-utilities",
  "@mui/material",
  "@vitejs/plugin-react",
  "antd",
  "daisyui",
  "mantine",
  "primevue",
  "react",
  "react-dom",
  "react-native-paper",
  "shadcn",
  "tailwindcss",
  "vuetify",
]);

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

const errors = [];
const entries = await readdir(packageRoot);

function sameStringMap(left, right) {
  const leftEntries = Object.entries(left ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const rightEntries = Object.entries(right ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

if (rootManifest.private !== true) {
  errors.push("workspace root must remain private");
}
if (rootManifest.dependencies !== undefined) {
  errors.push("workspace root must not declare runtime dependencies");
}
for (const accidentalKey of ["main", "directories", "keywords", "author"]) {
  if (Object.hasOwn(rootManifest, accidentalKey)) {
    errors.push(
      `workspace root contains accidental npm field ${accidentalKey}`,
    );
  }
}

const lockRoot = lockfile.packages?.[""];
if (lockRoot?.dependencies !== undefined) {
  errors.push("package-lock root must not declare runtime dependencies");
}
if (
  lockRoot?.name !== rootManifest.name ||
  lockRoot?.version !== rootManifest.version
) {
  errors.push("package-lock root identity does not match package.json");
}
if (!sameStringMap(lockRoot?.devDependencies, rootManifest.devDependencies)) {
  errors.push("package-lock root devDependencies do not match package.json");
}

for (const entry of entries.sort()) {
  const directory = path.join(packageRoot, entry);
  if (!(await stat(directory)).isDirectory()) continue;

  const manifestPath = path.join(directory, "package.json");
  const manifest = await readJson(manifestPath);
  const lockEntry = lockfile.packages?.[`packages/${entry}`];

  if (
    typeof manifest.name !== "string" ||
    !manifest.name.startsWith("@s9rg/theme-")
  ) {
    errors.push(`${entry}: public package name must start with @s9rg/theme-`);
  }
  if (manifest.version !== "0.6.0") {
    errors.push(`${entry}: expected synchronized version 0.6.0`);
  }
  if (manifest.license !== "MIT") errors.push(`${entry}: license must be MIT`);
  if (manifest.private === true)
    errors.push(`${entry}: public package cannot be private`);
  if (manifest.type !== "module")
    errors.push(`${entry}: package type must be module`);
  if (manifest.engines?.node !== ">=20.19")
    errors.push(`${entry}: Node floor must be >=20.19`);
  if (
    lockEntry?.name !== manifest.name ||
    lockEntry?.version !== manifest.version
  ) {
    errors.push(`${entry}: package-lock identity does not match package.json`);
  }
  if (!sameStringMap(lockEntry?.dependencies, manifest.dependencies)) {
    errors.push(
      `${entry}: package-lock dependencies do not match package.json`,
    );
  }
  if (!sameStringMap(lockEntry?.peerDependencies, manifest.peerDependencies)) {
    errors.push(
      `${entry}: package-lock peerDependencies do not match package.json`,
    );
  }

  const dependencies = manifest.dependencies ?? {};
  for (const [name, range] of Object.entries(dependencies)) {
    if (forbiddenRuntimePackages.has(name)) {
      errors.push(
        `${entry}: target framework ${name} cannot be a runtime dependency`,
      );
    }
    if (typeof range !== "string" || /^(?:file|link):/.test(range)) {
      errors.push(
        `${entry}: dependency ${name} must use a publishable version range`,
      );
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Verified ${entries.length} public package manifests.`);
}
