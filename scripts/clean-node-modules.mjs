import { readdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const includeHidden = args.has("--include-hidden");
const targetName = "node_modules";
const ignoredDirectoryNames = new Set([
  ".git",
  ".hg",
  ".svn",
  ".worktrees",
  "release",
  "dist",
  ".tmp"
]);

function isInsideRoot(candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function shouldSkipDirectory(name) {
  if (ignoredDirectoryNames.has(name)) {
    return true;
  }

  return !includeHidden && name.startsWith(".") && name !== targetName;
}

async function findNodeModulesDirectories(directory, matches = []) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (!isInsideRoot(fullPath)) {
      throw new Error(`Refusing to inspect path outside repo: ${fullPath}`);
    }

    if (entry.name === targetName) {
      matches.push(fullPath);
      continue;
    }

    if (!shouldSkipDirectory(entry.name)) {
      await findNodeModulesDirectories(fullPath, matches);
    }
  }

  return matches;
}

const matches = (await findNodeModulesDirectories(root)).sort((a, b) => b.length - a.length);

if (matches.length === 0) {
  console.log("No node_modules directories found.");
  process.exit(0);
}

console.log(`${dryRun ? "Would remove" : "Removing"} ${matches.length} node_modules directories:`);
for (const directory of matches) {
  console.log(`- ${path.relative(root, directory)}`);
}

if (dryRun) {
  console.log("\nDry run only. Run `pnpm clean:node-modules` to remove them.");
  process.exit(0);
}

for (const directory of matches) {
  if (!isInsideRoot(directory) || path.basename(directory) !== targetName) {
    throw new Error(`Refusing to remove unsafe path: ${directory}`);
  }

  await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}

console.log("\nDone.");
