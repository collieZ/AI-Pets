export interface PetCatalogItem {
  id: string;
  label: string;
  sourceType: "ai-pet-protocol" | "codex-pet";
  manifestUrl: string;
  assetBaseUrl: string;
  importedAt?: string;
  updatedAt?: string;
}

export function mergePetCatalogs(builtInPets: PetCatalogItem[], importedPets: PetCatalogItem[]) {
  const builtInIds = new Set(builtInPets.map((pet) => pet.id));
  return [...builtInPets, ...importedPets.filter((pet) => !builtInIds.has(pet.id))];
}
