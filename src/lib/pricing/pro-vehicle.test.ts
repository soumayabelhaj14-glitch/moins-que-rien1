import { describe, expect, it } from "vitest";
import { computePro, defaultProConfig } from "./pro";
import { computeVehicle, defaultVehicleConfig } from "./vehicle";

describe("moteurs distincts pro et véhicules (configurables)", () => {
  it("pro : la configuration fournie est appliquée", () => {
    const cfg = { ...defaultProConfig, categories: [{ id: "x", label: "X", startRate: 0.5 }], stockAgeCoefficients: [1], conditions: [{ id: "n", label: "N", coefficient: 1 }], volumeTiers: [{ minQty: 1, coefficient: 1 }, { minQty: 10, coefficient: 0.5 }] };
    expect(computePro({ referenceValueHT: 100, category: "x", stockAgeYears: 0, condition: "n", quantity: 1 }, cfg).maxPrice).toBe(50);
    expect(computePro({ referenceValueHT: 100, category: "x", stockAgeYears: 0, condition: "n", quantity: 12 }, cfg).maxPrice).toBe(25);
  });
  it("véhicule : tranche kilométrique appliquée", () => {
    const cfg = { ...defaultVehicleConfig, types: [{ id: "v", label: "V", startRate: 0.5 }], ageCoefficients: [1], conditions: [{ id: "b", label: "B", coefficient: 1 }], mileageTiers: [{ minKm: 0, coefficient: 1 }, { minKm: 100000, coefficient: 0.8 }] };
    expect(computeVehicle({ referenceValue: 10000, type: "v", ageYears: 0, km: 150000, condition: "b" }, cfg).maxPrice).toBe(4000);
  });
});
