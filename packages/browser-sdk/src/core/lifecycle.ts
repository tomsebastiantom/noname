type UnloadCallback = () => void;

const callbacks: UnloadCallback[] = [];
let registered = false;

export function onUnload(cb: UnloadCallback): void {
  callbacks.push(cb);
  if (!registered) {
    registered = true;
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", runAll);
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          runAll();
        }
      });
    }
  }
}

function runAll(): void {
  for (const cb of callbacks) {
    try {
      cb();
    } catch {
      // Never throw in unload handlers
    }
  }
}
