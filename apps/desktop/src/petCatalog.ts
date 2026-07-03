import type { PetCatalogItem } from "./petCatalogModel";

export type { PetCatalogItem } from "./petCatalogModel";

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
