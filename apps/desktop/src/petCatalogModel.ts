export type PetCatalogItem =
  | {
      id: string;
      label: string;
      sourceType: "ai-pet-protocol";
      manifestUrl: string;
      assetBaseUrl: string;
    }
  | {
      id: string;
      label: string;
      sourceType: "codex-pet";
      manifestUrl: string;
      assetBaseUrl: string;
    };

export function mergePetCatalogs(builtInPets: PetCatalogItem[], importedPets: PetCatalogItem[]) {
  const builtInIds = new Set(builtInPets.map((pet) => pet.id));
  return [...builtInPets, ...importedPets.filter((pet) => !builtInIds.has(pet.id))];
}
