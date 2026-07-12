let debugEnabled = false;

export function setDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

export function debug(tag: string, ...args: unknown[]): void {
  if (debugEnabled) {
    console.debug(`[noname:${tag}]`, ...args);
  }
}

export function warn(tag: string, ...args: unknown[]): void {
  if (debugEnabled) {
    console.warn(`[noname:${tag}]`, ...args);
  }
}
