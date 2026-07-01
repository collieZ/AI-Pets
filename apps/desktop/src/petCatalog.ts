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

const assetBase = import.meta.env.BASE_URL;

export const petCatalog: PetCatalogItem[] = [
  {
    id: "example-buddy",
    label: "示例伙伴",
    sourceType: "ai-pet-protocol",
    manifestUrl: `${assetBase}pets/example-buddy/manifest.json`,
    assetBaseUrl: `${assetBase}pets/example-buddy/`
  },
  {
    id: "yibao-codex",
    label: "怡宝",
    sourceType: "codex-pet",
    manifestUrl: `${assetBase}pets/yibao-codex/pet.json`,
    assetBaseUrl: `${assetBase}pets/yibao-codex/`
  }
];
