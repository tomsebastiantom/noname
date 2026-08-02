export function pinComponentType(pinnedTypes: string[], componentType: string): string[] {
  if (pinnedTypes.includes(componentType)) return pinnedTypes;
  return [...pinnedTypes, componentType];
}

export function unpinComponentType(pinnedTypes: string[], componentType: string): string[] {
  return pinnedTypes.filter((type) => type !== componentType);
}
