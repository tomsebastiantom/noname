/** Palette drag type — readable during dragover (getData is blocked until drop). */
let activeDragComponentType: string | null = null;

export function setEditorDragComponentType(componentType: string | null): void {
  activeDragComponentType = componentType;
}

export function getEditorDragComponentType(): string | null {
  return activeDragComponentType;
}
