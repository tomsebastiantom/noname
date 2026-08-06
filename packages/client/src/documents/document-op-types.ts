/** Mirrors server `DocumentOpPayload` for activity timeline UI. */
export type DocumentOpPayload =
  | {
      opType: "patch_spec";
      patch: Array<{
        op: string;
        path: string;
        value?: unknown;
      }>;
      baseUpdatedAt?: string;
    }
  | {
      opType: "patch_data";
      patch: Array<{
        op: string;
        path: string;
        value?: unknown;
      }>;
      baseUpdatedAt?: string;
    }
  | {
      opType: "lifecycle";
      action: "publish" | "archive" | "delete";
    };
