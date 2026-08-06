import type { AnyDocumentId, DocHandle, Repo } from "@automerge/automerge-repo/slim";

const COLLAB_READY_STATES = ["ready", "unavailable"] as const;

/** automerge-repo 2.5: cached terminal handles omit `untilReady` on findWithProgress. */
export async function awaitCollabDocHandle<T>(
  repo: Repo,
  documentId: AnyDocumentId,
): Promise<DocHandle<T>> {
  const progress = repo.findWithProgress<T>(documentId);

  if ("untilReady" in progress && typeof progress.untilReady === "function") {
    return progress.untilReady([...COLLAB_READY_STATES]);
  }

  if ("subscribe" in progress) {
    return new Promise((resolve, reject) => {
      const unsubscribe = progress.subscribe((state) => {
        if (state.state === "ready" || state.state === "unavailable") {
          unsubscribe();
          resolve(state.handle);
          return;
        }
        if (state.state === "failed") {
          unsubscribe();
          reject(state.error);
        }
      });
    });
  }

  if (progress.state === "ready" || progress.state === "unavailable") {
    return progress.handle;
  }
  if (progress.state === "failed") {
    throw progress.error;
  }

  await progress.handle.whenReady([...COLLAB_READY_STATES]);
  return progress.handle;
}
