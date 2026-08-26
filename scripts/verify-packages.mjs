import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const packageRoot = path.join(root, "packages");
const cacheRoot = path.join(root, "node_modules", ".cache");
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const publintExecutable = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "publint.cmd" : "publint",
);
const attwExecutable = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "attw.cmd" : "attw",
);

await mkdir(cacheRoot, { recursive: true });
const temporaryRoot = await mkdtemp(path.join(cacheRoot, "theme-packages-"));
const rootManifestBefore = await readFile(
  path.join(root, "package.json"),
  "utf8",
);
const lockfileBefore = await readFile(
  path.join(root, "package-lock.json"),
  "utf8",
);

try {
  const directories = [];
  for (const entry of (await readdir(packageRoot)).sort()) {
    const directory = path.join(packageRoot, entry);
    if ((await stat(directory)).isDirectory()) directories.push(directory);
  }

  for (const directory of directories) {
    await verifyPackedPackage(directory);
  }

  await verifyWorkspaceEntrypoints(directories);
  console.log(`Verified ${directories.length} packed public packages.`);
} finally {
  assert.equal(
    await readFile(path.join(root, "package.json"), "utf8"),
    rootManifestBefore,
    "npm pack mutated the private workspace manifest",
  );
  assert.equal(
    await readFile(path.join(root, "package-lock.json"), "utf8"),
    lockfileBefore,
    "npm pack mutated the workspace lockfile",
  );
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function verifyPackedPackage(directory) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, "package.json"), "utf8"),
  );
  const { stdout } = await run(
    npmExecutable,
    [
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      temporaryRoot,
      directory,
    ],
    {
      cwd: root,
      env: { ...process.env, NO_COLOR: "1" },
      maxBuffer: 10_000_000,
    },
  );
  const packed = JSON.parse(stdout);
  assert.equal(packed.length, 1, `${manifest.name} produced multiple tarballs`);
  const metadata = packed[0];
  const tarball = path.join(temporaryRoot, metadata.filename);
  const filenames = new Set(metadata.files.map((file) => file.path));

  for (const expected of [
    "package.json",
    "README.md",
    "LICENSE",
    "dist/index.js",
    "dist/index.cjs",
    "dist/index.d.ts",
  ]) {
    assert.ok(
      filenames.has(expected),
      `${manifest.name} is missing ${expected}`,
    );
  }
  assert.ok(metadata.size > 0, `${manifest.name} tarball is empty`);
  assert.ok(metadata.integrity.startsWith("sha512-"));
  assert.ok(![...filenames].some((file) => file.startsWith("src/")));

  await run(publintExecutable, ["run", tarball, "--strict"], {
    cwd: root,
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 10_000_000,
  });
  await run(
    attwExecutable,
    [tarball, "--profile", "strict", "--no-emoji", "--no-color"],
    {
      cwd: root,
      env: { ...process.env, NO_COLOR: "1" },
      maxBuffer: 10_000_000,
    },
  );
}

async function verifyWorkspaceEntrypoints(directories) {
  for (const directory of directories) {
    const manifest = JSON.parse(
      await readFile(path.join(directory, "package.json"), "utf8"),
    );
    const imported = await import(manifest.name);
    const required = require(manifest.name);
    assert.ok(
      Object.keys(imported).length > 0,
      `${manifest.name} ESM entrypoint has no exports`,
    );
    assert.ok(
      Object.keys(required).length > 0,
      `${manifest.name} CJS entrypoint has no exports`,
    );
  }
}
