function normalizeTableValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const text = String(value).trim();
  if (!text) return null;
  const numericMatch = text.match(/^-?\d+(?:\.\d+)?$/);
  if (numericMatch) return Number(text);
  const percentMatch = text.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (percentMatch) return Number(percentMatch[1]);
  const latencyMatch = text.match(/^(-?\d+(?:\.\d+)?)\s*ms$/i);
  if (latencyMatch) return Number(latencyMatch[1]);
  const sizeMatch = text.match(/^(-?\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)$/i);
  if (sizeMatch) {
    const unitScale: Record<string, number> = { KB: 1, MB: 1024, GB: 1024 ** 2, TB: 1024 ** 3 };
    return Number(sizeMatch[1]) * unitScale[sizeMatch[2].toUpperCase()];
  }
  return text;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
}

function latencyValue(value: string) {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*ms$/i);
  return match ? Number(match[1]) : null;
}

export { latencyValue, normalizeTableValue, uniqueSorted };
