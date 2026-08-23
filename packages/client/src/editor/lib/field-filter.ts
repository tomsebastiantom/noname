/** Complex wiring fields stay out of the props panel until we have dedicated editors. */
export function isHiddenEditorField(path: string): boolean {
  if (path === "params") return true;
  return false;
}
