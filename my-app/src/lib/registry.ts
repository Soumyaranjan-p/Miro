import fs from "node:fs";
import path from "node:path";

export type RegistryType = "registry:icon" | "registry:component" | "registry:block" | "registry:lib";

export interface RegistryFile {
  path: string;
  type: RegistryType;
  content: string;
}

export interface PropDoc {
  name: string;
  type: string;
  default?: string;
  description: string;
}

export interface ControlSpec {
  key: string;
  label: string;
  type: "slider" | "select" | "color" | "toggle";
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
  default: string | number | boolean;
}

export interface RegistryEntry {
  name: string;
  type: RegistryType;
  title: string;
  description: string;
  categories: string[];
  files: RegistryFile[];
  dependencies?: string[];
  registryDependencies?: string[];
  props?: PropDoc[];
  accessibility?: string;
  touch?: string;
  reducedMotion?: string;
  playground?: ControlSpec[];
}

const REGISTRY_DIR = path.join(process.cwd(), "registry");

function readEntry(fileName: string): RegistryEntry | null {
  const filePath = path.join(REGISTRY_DIR, fileName);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as RegistryEntry;
  } catch {
    return null;
  }
}

export function getRegistryEntries(): RegistryEntry[] {
  if (!fs.existsSync(REGISTRY_DIR)) return [];
  return fs
    .readdirSync(REGISTRY_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readEntry(f))
    .filter((e): e is RegistryEntry => e !== null)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getRegistryEntry(name: string): RegistryEntry | null {
  return readEntry(`${name}.json`);
}

export function getEntriesByType(type: RegistryType): RegistryEntry[] {
  return getRegistryEntries().filter((e) => e.type === type);
}

export function registryToSchema(entry: RegistryEntry) {
  return {
    $schema: "https://mirro-ui.com/schema/registry.json",
    name: entry.name,
    type: entry.type,
    title: entry.title,
    description: entry.description,
    categories: entry.categories,
    files: entry.files.map((f) => ({ path: f.path, type: f.type })),
    dependencies: entry.dependencies ?? [],
    registryDependencies: entry.registryDependencies ?? [],
  };
}
