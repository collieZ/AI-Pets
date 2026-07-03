import assert from "node:assert/strict";
import test from "node:test";
import { mergePetCatalogs } from "../apps/desktop/src/petCatalogModel.js";

test("mergePetCatalogs appends imported pets after built-in pets", () => {
  const builtInPets = [
    {
      id: "built-in",
      label: "内置宠物",
      sourceType: "ai-pet-protocol" as const,
      manifestUrl: "/pets/built-in/manifest.json",
      assetBaseUrl: "/pets/built-in/"
    }
  ];
  const importedPets = [
    {
      id: "imported",
      label: "导入宠物",
      sourceType: "ai-pet-protocol" as const,
      manifestUrl: "ai-pets://imported-pets/imported/manifest.json",
      assetBaseUrl: "ai-pets://imported-pets/imported/"
    }
  ];

  assert.deepEqual(mergePetCatalogs(builtInPets, importedPets), [...builtInPets, ...importedPets]);
});

test("mergePetCatalogs keeps built-in pets when imported ids conflict", () => {
  const builtInPets = [
    {
      id: "same-id",
      label: "内置宠物",
      sourceType: "ai-pet-protocol" as const,
      manifestUrl: "/pets/same-id/manifest.json",
      assetBaseUrl: "/pets/same-id/"
    }
  ];
  const importedPets = [
    {
      id: "same-id",
      label: "导入宠物",
      sourceType: "ai-pet-protocol" as const,
      manifestUrl: "ai-pets://imported-pets/same-id/manifest.json",
      assetBaseUrl: "ai-pets://imported-pets/same-id/"
    }
  ];

  assert.deepEqual(mergePetCatalogs(builtInPets, importedPets), builtInPets);
});
