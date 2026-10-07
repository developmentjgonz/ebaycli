import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = join(root, "cli");
const ignored = new Set([".git", ".idea", ".wrangler", "node_modules", "dist", "bin", "obj", "coverage"]);
const repository = "https://github.com/developmentjgonz/ebaycli/";
const failures = [];

function documents(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return documents(path);
    return /\.(md|txt)$/.test(entry.name) ? [path] : [];
  });
}

function links(source) {
  return [...source.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]);
}

function localTarget(document, link) {
  let target = link.replace(/^<|>$/g, "").split("#")[0].split("?")[0];
  if (!target) return undefined;
  if (target.startsWith(repository)) {
    const match = target.slice(repository.length).match(/^(?:blob|tree)\/main\/(.+)$/);
    return match ? resolve(root, decodeURIComponent(match[1])) : undefined;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("//")) return undefined;
  return resolve(dirname(document), decodeURIComponent(target));
}

const docs = documents(root);
for (const document of docs) {
  for (const link of links(readFileSync(document, "utf8"))) {
    const target = localTarget(document, link);
    if (target && !existsSync(target)) failures.push(`${relative(root, document)}: missing target ${link}`);
  }
}

// Inspect the actual package allowlist, including npm's built-in exclusions.
const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: packageRoot,
  encoding: "utf8",
  shell: process.platform === "win32"
});
if (packed.status !== 0) {
  failures.push(`npm package inspection failed: ${packed.stderr.trim()}`);
} else {
  const files = new Set(JSON.parse(packed.stdout)[0].files.map((file) => file.path));
  for (const required of ["dist/index.js", "README.md", "LICENSE", "llms.txt", "SUPPORT_MATRIX.md", "examples/README.md", "examples/listing.yaml", "examples/listing-trading.yaml", "examples/price-update.yaml", "examples/policies.yaml", "examples/location.yaml"]) {
    if (!files.has(required)) failures.push(`npm package is missing ${required}; build the CLI first.`);
  }
  for (const name of [...files].filter((file) => /\.(md|txt)$/.test(file))) {
    const document = join(packageRoot, name);
    for (const link of links(readFileSync(document, "utf8"))) {
      if (/^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith("#") || link.startsWith("//")) continue;
      const target = localTarget(document, link);
      if (!target) continue;
      const packagePath = relative(packageRoot, target).split(sep).join("/");
      if (!files.has(packagePath)) failures.push(`packaged ${name}: unavailable relative link ${link}; use a repository URL.`);
    }
  }
}

if (failures.length) {
  process.stderr.write(failures.join("\n") + "\n");
  process.exitCode = 1;
} else {
  process.stdout.write(`Checked ${docs.length} documentation files and the npm package.\n`);
}
