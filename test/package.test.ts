import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

/**
 * Unlike the other test files, this one builds no temporary tree: the manifest and
 * the licence are the artefacts under test, so the cases read the project root they
 * ship from. An absent file there is a finding, not a fixture gap.
 */
const PACKAGE_JSON = new URL("../package.json", import.meta.url);
const LICENSE = new URL("../LICENSE", import.meta.url);

/**
 * Only the fields a release has to carry. Everything optional, because `JSON.parse`
 * promises nothing; a missing field then fails an assertion instead of a type check
 * that never ran.
 */
interface Manifest {
  readonly private?: boolean;
  readonly version?: string;
  readonly description?: string;
  readonly license?: string;
  readonly keywords?: string[];
  readonly engines?: { readonly node?: string };
  readonly repository?: { readonly url?: string };
  readonly files?: string[];
  readonly pi?: { readonly extensions?: string[] };
}

it("manifest is not private", () => {
  // GIVEN the real manifest of the package that is about to be released,
  const manifest: Manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));

  // WHEN we look at its `private` flag, which may be absent or `false`,
  // THEN it must not mark the package un-installable as a package:
  expect(manifest.private ?? false).toBe(false);
});

it("manifest carries the release metadata", () => {
  // GIVEN the real manifest of the package that is about to be released,
  const manifest: Manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));

  // WHEN we read the fields a package manager and the pi gallery publish,
  // THEN none of them may be missing or empty,
  expect(manifest.version).toBeTypeOf("string");
  expect(manifest.version).not.toBe("");
  expect(manifest.description).toBeTypeOf("string");
  expect(manifest.description).not.toBe("");
  expect(manifest.license).toBeTypeOf("string");
  expect(manifest.license).not.toBe("");
  expect(manifest.engines?.node).toBeTypeOf("string");
  expect(manifest.engines?.node).not.toBe("");

  // AND the version must not stay at the placeholder that means "never released",
  expect(manifest.version).not.toBe("0.0.0");

  // AND the keyword the gallery reads and the repository the release points at
  // have to be filled:
  expect(manifest.keywords).toContain("pi-package");
  expect(manifest.repository?.url).toContain("github.com/adrianhoehne/agent-switch");
});

it("the files allowlist covers every extension path", () => {
  // GIVEN the manifest whose `pi.extensions` names the entry points and whose
  // `files` allowlist decides what ends up in the tarball,
  const manifest: Manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
  const extensions = manifest.pi?.extensions ?? [];
  const allowedPaths = (manifest.files ?? []).map((entry) => entry.replace(/^\.\//, "").replace(/\/+$/, ""));

  // WHEN each extension path is matched against the allowlist,
  // THEN some entry has to cover it — a narrowed allowlist would otherwise ship a
  // package that pi installs without an entry point. npm writes the entry point as
  // "./src/extension.ts" and the allowlist as "src", so both are normalised first.
  expect(extensions.length).toBeGreaterThan(0);
  for (const extensionPath of extensions) {
    const extPath = extensionPath.replace(/^\.\//, "").replace(/\/+$/, "");
    const isCovered = allowedPaths.some((allowed) => extPath === allowed || extPath.startsWith(`${allowed}/`));
    expect(isCovered).toBe(true);
  }
});

it("LICENSE is MIT and matches the license field", () => {
  // GIVEN the licence file and the manifest that ships next to it,
  const licenseText = readFileSync(LICENSE, "utf8");
  const manifest: Manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));

  // WHEN we read the title line of the licence,
  const firstLine = licenseText.split("\n")[0].trim();

  // THEN the file must be MIT and the manifest must say the same, so the two
  // cannot drift apart:
  expect(firstLine).toMatch(/^MIT License$/i);
  expect(manifest.license).toBe("MIT");
});
