#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const REGISTRY_DIR = path.resolve(__dirname, "../../registry");

interface RegistryFile {
  path: string;
  type: string;
  content: string;
}

interface RegistryEntry {
  name: string;
  type: string;
  title: string;
  description: string;
  categories: string[];
  files: RegistryFile[];
  dependencies?: string[];
  registryDependencies?: string[];
}

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function log(message = ""): void {
  console.log(message);
}

function loadEntry(name: string): RegistryEntry | null {
  const filePath = path.join(REGISTRY_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as RegistryEntry;
  } catch {
    return null;
  }
}

function listEntries(): RegistryEntry[] {
  if (!fs.existsSync(REGISTRY_DIR)) return [];
  return fs
    .readdirSync(REGISTRY_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => loadEntry(f.replace(".json", "")))
    .filter((e): e is RegistryEntry => e !== null);
}

function resolveEntries(names: string[]): { entries: RegistryEntry[]; missing: string[] } {
  const resolved = new Map<string, RegistryEntry>();
  const missing: string[] = [];
  const queue = [...names];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const entry = loadEntry(name);
    if (!entry) {
      missing.push(name);
      continue;
    }
    resolved.set(name, entry);
    for (const dep of entry.registryDependencies ?? []) {
      if (!seen.has(dep)) queue.push(dep);
    }
  }

  return { entries: [...resolved.values()], missing };
}

function detectProject(): {
  hasPackageJson: boolean;
  tailwindVersion: "v3" | "v4" | "none";
  cssPath: string | null;
  isAppRouter: boolean;
} {
  const cwd = process.cwd();
  const hasPackageJson = fs.existsSync(path.join(cwd, "package.json"));

  const v3Config = ["tailwind.config.js", "tailwind.config.ts", "tailwind.config.cjs", "tailwind.config.mjs"].find((f) =>
    fs.existsSync(path.join(cwd, f))
  );

  let cssPath: string | null = null;
  const cssCandidates = [
    "src/app/globals.css",
    "app/globals.css",
    "src/styles/globals.css",
    "src/index.css",
    "src/styles.css",
  ];
  for (const candidate of cssCandidates) {
    if (fs.existsSync(path.join(cwd, candidate))) {
      cssPath = path.join(cwd, candidate);
      break;
    }
  }

  let tailwindVersion: "v3" | "v4" | "none" = "none";
  if (v3Config) {
    tailwindVersion = "v3";
  } else if (cssPath) {
    const css = fs.readFileSync(cssPath, "utf-8");
    if (css.includes('@import "tailwindcss"') || css.includes("tailwindcss")) {
      tailwindVersion = "v4";
    }
  }

  const isAppRouter =
    fs.existsSync(path.join(cwd, "src/app")) || fs.existsSync(path.join(cwd, "app"));

  return { hasPackageJson, tailwindVersion, cssPath, isAppRouter };
}

const MIRRO_CSS_MARKER = "/* mirro-ui */";

const MIRRO_V4_CSS = `/* mirro-ui */
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}

@theme {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}
`;

function cmdInit(): void {
  const project = detectProject();

  if (!project.hasPackageJson) {
    log(`${COLORS.red}✗${COLORS.reset} No package.json found. Run this command in a Next.js or React project.`);
    process.exit(1);
  }

  log(`${COLORS.bold}Mirro UI — init${COLORS.reset}`);
  log("");

  if (project.tailwindVersion === "none") {
    log(`${COLORS.yellow}!${COLORS.reset} Tailwind CSS not detected. Install Tailwind and re-run init to merge Mirro's design tokens.`);
  } else if (project.tailwindVersion === "v4" && project.cssPath) {
    const css = fs.readFileSync(project.cssPath, "utf-8");
    if (css.includes(MIRRO_CSS_MARKER)) {
      log(`${COLORS.green}✓${COLORS.reset} Mirro design tokens already present in ${path.relative(process.cwd(), project.cssPath)}.`);
    } else {
      fs.appendFileSync(project.cssPath, `\n${MIRRO_V4_CSS}`);
      log(`${COLORS.green}✓${COLORS.reset} Added Mirro design tokens to ${path.relative(process.cwd(), project.cssPath)}.`);
    }
  } else if (project.tailwindVersion === "v3") {
    log(`${COLORS.yellow}!${COLORS.reset} Tailwind v3 detected. Add these to your tailwind.config theme.extend:`);
    log(`   ${COLORS.dim}transitionTimingFunction: { "ease-out": "cubic-bezier(0.23, 1, 0.32, 1)", "ease-in-out": "cubic-bezier(0.77, 0, 0.175, 1)", "ease-drawer": "cubic-bezier(0.32, 0.72, 0, 1)" }${COLORS.reset}`);
  }

  log("");
  log(`Add a component with:`);
  log(`  ${COLORS.cyan}npx mirro-ui add <name>${COLORS.reset}`);
  log("");
  log(`Available:`);
  for (const entry of listEntries()) {
    log(`  ${COLORS.cyan}${entry.name}${COLORS.reset} ${COLORS.dim}— ${entry.title}${COLORS.reset}`);
  }
}

function cmdAdd(names: string[], force: boolean): void {
  if (names.length === 0) {
    log(`${COLORS.red}✗${COLORS.reset} Specify at least one component: npx mirro-ui add <name>`);
    process.exit(1);
  }

  const { entries, missing } = resolveEntries(names);

  if (missing.length > 0) {
    for (const name of missing) {
      log(`${COLORS.red}✗${COLORS.reset} "${name}" not found in the registry.`);
    }
    log("");
    log(`Available:`);
    for (const entry of listEntries()) {
      log(`  ${COLORS.cyan}${entry.name}${COLORS.reset} ${COLORS.dim}— ${entry.title}${COLORS.reset}`);
    }
    process.exit(1);
  }

  const cwd = process.cwd();
  const written: string[] = [];
  const skipped: string[] = [];
  const fileSet = new Map<string, string>();

  for (const entry of entries) {
    for (const file of entry.files) {
      fileSet.set(file.path, file.content);
    }
  }

  for (const [target, content] of fileSet) {
    const targetPath = path.join(cwd, target);
    if (fs.existsSync(targetPath) && !force) {
      skipped.push(target);
      continue;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content);
    written.push(target);
  }

  const deps = new Set<string>();
  for (const entry of entries) {
    for (const dep of entry.dependencies ?? []) deps.add(dep);
  }

  log(`${COLORS.bold}Mirro UI — add${COLORS.reset}`);
  log("");
  for (const entry of entries) {
    log(`${COLORS.green}✓${COLORS.reset} ${entry.title}`);
  }
  log("");

  if (written.length > 0) {
    log(`${COLORS.bold}Files:${COLORS.reset}`);
    for (const file of written) log(`  ${COLORS.green}+${COLORS.reset} ${file}`);
  }
  if (skipped.length > 0) {
    log("");
    log(`${COLORS.yellow}Skipped (already exists):${COLORS.reset}`);
    for (const file of skipped) log(`  ${COLORS.yellow}!${COLORS.reset} ${file}`);
    log(`  ${COLORS.dim}Use --force to overwrite.${COLORS.reset}`);
  }

  if (deps.size > 0) {
    log("");
    log(`${COLORS.bold}Dependencies:${COLORS.reset}`);
    const depList = [...deps].join(" ");
    log(`  ${COLORS.cyan}${depList}${COLORS.reset}`);
    const pkgManager = fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))
      ? "pnpm"
      : fs.existsSync(path.join(cwd, "yarn.lock"))
        ? "yarn"
        : "npm";
    const installCmd = pkgManager === "npm" ? `npm install ${depList}` : pkgManager === "pnpm" ? `pnpm add ${depList}` : `yarn add ${depList}`;
    log(`  Run: ${COLORS.cyan}${installCmd}${COLORS.reset}`);
  }

  log("");
  log(`${COLORS.green}Done.${COLORS.reset} Import your components and start animating.`);
}

function cmdList(): void {
  const entries = listEntries();
  if (entries.length === 0) {
    log("No components in the registry.");
    return;
  }
  log(`${COLORS.bold}Mirro UI${COLORS.reset}`);
  log("");
  for (const entry of entries) {
    const type = entry.type.replace("registry:", "");
    log(`  ${COLORS.cyan}${entry.name}${COLORS.reset} ${COLORS.dim}(${type})${COLORS.reset}`);
    log(`    ${entry.description}`);
  }
}

const VERSION = "0.1.0";

function cmdHelp(): void {
  log(`${COLORS.bold}Mirro UI${COLORS.reset} ${COLORS.dim}v${VERSION}${COLORS.reset}`);
  log("");
  log("Usage:");
  log(`  ${COLORS.cyan}mirro-ui init${COLORS.reset}              Detect your project and merge Mirro design tokens`);
  log(`  ${COLORS.cyan}mirro-ui add <name...>${COLORS.reset}   Copy components into your project`);
  log(`  ${COLORS.cyan}mirro-ui list${COLORS.reset}             List available components`);
  log("");
  log("Examples:");
  log(`  ${COLORS.cyan}npx mirro-ui init${COLORS.reset}`);
  log(`  ${COLORS.cyan}npx mirro-ui add heart${COLORS.reset}`);
  log(`  ${COLORS.cyan}npx mirro-ui add magnetic-button spotlight-card${COLORS.reset}`);
}

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];
  const force = args.includes("--force");
  const rest = args.filter((a) => a !== "--force");

  switch (command) {
    case "init":
      cmdInit();
      break;
    case "add":
      cmdAdd(rest.slice(1), force);
      break;
    case "list":
      cmdList();
      break;
    case "--version":
    case "-v":
      log(`mirro-ui v${VERSION}`);
      break;
    case "--help":
    case "-h":
    case "help":
      cmdHelp();
      break;
    default:
      cmdHelp();
      break;
  }
}

main();
