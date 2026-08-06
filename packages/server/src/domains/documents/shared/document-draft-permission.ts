import { PERMISSIONS, type PermissionKey } from "@noname/auth";

/** Platform draft-write permission for a stored document type. */
export function draftWritePermissionForDocumentType(type: string): PermissionKey {
  switch (type) {
    case "layout":
      return PERMISSIONS.LAYOUT_DRAFT_WRITE;
    case "page":
      return PERMISSIONS.PAGE_DRAFT_WRITE;
    default:
      return PERMISSIONS.CONTENT_DRAFT_WRITE;
  }
}
