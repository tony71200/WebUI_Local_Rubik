// localStorage can be missing or throw (file:// origins, private windows): fall back to defaults.
export function load(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(`rubik.${key}`) ?? null;
  } catch {
    return null;
  }
}

export function save(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(`rubik.${key}`, value);
  } catch {
    // storage blocked: the setting just won't persist
  }
}
