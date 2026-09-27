type ClassValue = string | number | boolean | null | undefined | ClassValue[] | Record<string, boolean | null | undefined>;

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];

  const push = (value: ClassValue) => {
    if (!value) return;
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
    } else if (Array.isArray(value)) {
      for (const item of value) push(item);
    } else if (typeof value === "object") {
      for (const key in value) {
        if (value[key]) out.push(key);
      }
    }
  };

  for (const input of inputs) push(input);
  return out.join(" ");
}
