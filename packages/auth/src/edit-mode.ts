/** True when the request URL carries visual-editor entry flag. */
export function isEditModeUrl(url: URL): boolean {
  return url.searchParams.get("edit") === "true";
}

export const EDIT_MODE_FORBIDDEN_ERROR = "Forbidden: edit mode requires editor or admin role";
