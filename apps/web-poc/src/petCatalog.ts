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

export const petCatalog: PetCatalogItem[] = [
  {
    id: "example-buddy",
    label: "示例伙伴（AI Pet Protocol）",
    sourceType: "ai-pet-protocol",
    manifestUrl: "/pets/example-buddy/manifest.json",
    assetBaseUrl: "/pets/example-buddy/"
  },
  {
    id: "yibao-codex",
    label: "怡宝（Codex 兼容）",
    sourceType: "codex-pet",
    manifestUrl: "/pets/yibao-codex/pet.json",
    assetBaseUrl: "/pets/yibao-codex/"
  },
  {
    id: "simba",
    label: "辛巴（AI Pet Protocol + Codex）",
    sourceType: "ai-pet-protocol",
    manifestUrl: "/pets/simba/manifest.json",
    assetBaseUrl: "/pets/simba/"
  },
  {
    id: "huahua",
    label: "花花（本地复制）",
    sourceType: "codex-pet",
    manifestUrl: "/pets/huahua/pet.json",
    assetBaseUrl: "/pets/huahua/"
  }
];
