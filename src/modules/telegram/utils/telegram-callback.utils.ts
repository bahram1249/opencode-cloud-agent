export function cb(t: string, v?: string): string {
  return JSON.stringify({ t, v: v ?? '' });
}

export function parseCb(data: string): { t: string; v: string } | null {
  try {
    const parsed = JSON.parse(data) as { t?: string; v?: string };
    if (!parsed.t) return null;
    return { t: parsed.t, v: parsed.v ?? '' };
  } catch {
    return null;
  }
}
