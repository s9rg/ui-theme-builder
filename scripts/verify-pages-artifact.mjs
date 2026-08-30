import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const distRoot = path.join(root, "apps", "playground", "dist");
const noticePath = path.join(distRoot, "THIRD_PARTY_NOTICES.txt");
const appManifest = JSON.parse(
  await readFile(path.join(root, "apps", "playground", "package.json"), "utf8"),
);
const index = await readFile(path.join(distRoot, "index.html"), "utf8");
const notice = await readFile(noticePath, "utf8");

assert.match(index, /(?:src|href)="\/ui-theme-builder\//);
const runtimeAssetReferences = [
  ...index.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"[^>]*>/gi),
].map((match) => match[1]);
assert.ok(
  runtimeAssetReferences.length > 0,
  "Pages index has no runtime assets",
);
for (const reference of runtimeAssetReferences) {
  const url = new URL(reference, "https://pages.invalid");
  assert.equal(
    url.origin,
    "https://pages.invalid",
    `Pages runtime asset must be local: ${reference}`,
  );
  assert.ok(
    url.pathname.startsWith("/ui-theme-builder/"),
    `Pages runtime asset is outside the configured base: ${reference}`,
  );
  const relativePath = decodeURIComponent(
    url.pathname.slice("/ui-theme-builder/".length),
  );
  const assetPath = path.resolve(distRoot, relativePath);
  assert.ok(
    assetPath.startsWith(`${distRoot}${path.sep}`),
    `Pages runtime asset escaped the artifact root: ${reference}`,
  );
  await readFile(assetPath);
}
assert.ok(
  notice.startsWith("UI Theme Builder — Third-Party Notices\n\n"),
  "Pages legal notice has an invalid header",
);
assert.ok(notice.endsWith("\n"), "Pages legal notice must end with a newline");
assert.ok(
  !notice.includes("\r"),
  "Pages legal notice must use LF line endings",
);
assert.ok(
  !notice.includes(root),
  "Pages legal notice must not expose an absolute workspace path",
);

const declaredCountMatch = /^Bundled packages: (\d+)$/m.exec(notice);
assert.ok(declaredCountMatch, "Pages legal notice has no package count");
const declaredCount = Number(declaredCountMatch[1]);
const packageSections = notice
  .split(
    "================================================================================\n",
  )
  .slice(1);
const packages = packageSections.map((section) => {
  const match = /^Package: (.+)@([^@\n]+)\n/.exec(section);
  assert.ok(match, "Pages legal notice contains an invalid package section");
  return {
    name: match[1],
    version: match[2],
    key: `${match[1]}@${match[2]}`,
  };
});
assert.equal(
  packages.length,
  declaredCount,
  "Pages legal notice package count is stale",
);
assert.equal(
  new Set(packages.map(({ key }) => key)).size,
  packages.length,
  "Pages legal notice contains duplicate packages",
);
assert.deepEqual(
  packages.map(({ key }) => key),
  packages.map(({ key }) => key).sort(),
  "Pages legal notice packages must be sorted deterministically",
);
assert.doesNotMatch(
  notice,
  /^Declared license: UNSPECIFIED$/m,
  "Every bundled package must declare its license",
);

const packageRoot = path.join(root, "packages");
const workspacePackages = new Set(
  await Promise.all(
    (await readdir(packageRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const manifest = JSON.parse(
          await readFile(
            path.join(packageRoot, entry.name, "package.json"),
            "utf8",
          ),
        );
        assert.equal(
          typeof manifest.name,
          "string",
          `${entry.name} has no package name`,
        );
        return manifest.name;
      }),
  ),
);
const requiredPackages = Object.keys(appManifest.dependencies ?? {}).filter(
  (name) => !workspacePackages.has(name),
);
requiredPackages.push("vite");
const emittedNames = new Set(packages.map(({ name }) => name));
for (const name of requiredPackages.sort()) {
  assert.ok(
    emittedNames.has(name),
    `Pages legal notice is missing bundled package ${name}`,
  );
}

assert.equal(
  packageSections.length,
  packages.length,
  "Every bundled package must have one legal notice section",
);
for (const section of packageSections) {
  assert.match(section, /^Package: .+@[^@\n]+\nDeclared license: .+\n/m);
  assert.match(section, /\n----- [^\n]+ -----\n\S/);
}

console.log(
  `Verified ${runtimeAssetReferences.length} local Pages assets and ${packages.length} bundled package notices.`,
);
