/**
 * Tests unitaires pour nameMatchesSufficiently et extractDiscriminatingTokens.
 *
 * Ces tests vérifient les cas critiques de sécurité :
 *  - iPhone 14 ≠ iPhone 15 (génération différente)
 *  - 128 Go ≠ 256 Go (capacité différente)
 *  - Câble USB-C iPhone ≠ iPhone (accessoire homonyme)
 *  - Produits sans ambiguïté → acceptés
 */

import { describe, it, expect } from "vitest";
import { nameMatchesSufficiently, extractDiscriminatingTokens } from "./price-search";

describe("extractDiscriminatingTokens", () => {
  it("extrait les numéros de génération", () => {
    const tokens = extractDiscriminatingTokens("iPhone 14 Pro");
    expect(tokens).toContain("14");
  });

  it("normalise les capacités en Go", () => {
    const tokens = extractDiscriminatingTokens("iPhone 14 Pro 256 Go");
    expect(tokens).toContain("256go");
  });

  it("normalise les capacités en GB", () => {
    const tokens = extractDiscriminatingTokens("Samsung Galaxy S23 128GB");
    expect(tokens).toContain("128go");
  });
});

describe("nameMatchesSufficiently — cas d'acceptation", () => {
  it("iPhone 14 Pro 256 Go → fiche iPhone 14 Pro 256go", () => {
    expect(
      nameMatchesSufficiently(
        "iPhone 14 Pro 256 Go",
        "Apple iPhone 14 Pro 256go Noir Sidéral",
      )
    ).toBe(true);
  });

  it("Samsung Galaxy S23 128GB → fiche Samsung S23 128go", () => {
    expect(
      nameMatchesSufficiently(
        "Samsung Galaxy S23 128GB",
        "Samsung Galaxy S23 128go Phantom Black",
      )
    ).toBe(true);
  });

  it("Vélo électrique Trek 500W → fiche Trek VEC 500W vélo électrique", () => {
    expect(
      nameMatchesSufficiently(
        "Vélo électrique Trek 500W",
        "Trek VEC 500W vélo électrique urbain",
      )
    ).toBe(true);
  });

  it("titre très court : LEGO 42150", () => {
    expect(
      nameMatchesSufficiently("LEGO 42150", "lego 42150 technic monster jam")
    ).toBe(true);
  });
});

describe("containsTokenAsWord — correspondance exacte de mot", () => {
  // Ces tests vérifient que "14" dans "iPhone 114" n'est PAS accepté.
  // C'est le faux positif signalé dans l'audit V7.
  it("🚨 token '14' ne doit PAS matcher '114' (sous-chaîne interdite)", () => {
    // iPhone 14 128 Go déclaré, mais l'API renvoie "iPhone 114 128 Go"
    expect(
      nameMatchesSufficiently("iPhone 14 128 Go", "Apple iPhone 114 128go")
    ).toBe(false);
  });

  it("✅ token '14' doit matcher '14' exactement", () => {
    expect(
      nameMatchesSufficiently("iPhone 14 128 Go", "Apple iPhone 14 128go")
    ).toBe(true);
  });

  it("🚨 token '7' ne doit PAS matcher '17' (sous-chaîne interdite)", () => {
    expect(
      nameMatchesSufficiently("Galaxy S7 32 Go", "Samsung Galaxy S17 32go")
    ).toBe(false);
  });

  it("🚨 token '256go' ne doit PAS matcher '1256go' (sous-chaîne interdite)", () => {
    expect(
      nameMatchesSufficiently("MacBook Pro 256 Go", "Apple MacBook Pro 1256go SSD")
    ).toBe(false);
  });
});

describe("nameMatchesSufficiently — cas de refus (sécurité)", () => {
  it("🚨 iPhone 14 ≠ iPhone 15 (génération différente)", () => {
    expect(
      nameMatchesSufficiently(
        "iPhone 14 Pro 256 Go",
        "Apple iPhone 15 Pro 256go Titane",
      )
    ).toBe(false);
  });

  it("🚨 128 Go ≠ 256 Go (capacité différente)", () => {
    expect(
      nameMatchesSufficiently(
        "iPhone 14 Pro 256 Go",
        "Apple iPhone 14 Pro 128go Noir",
      )
    ).toBe(false);
  });

  it("🚨 Câble USB-C iPhone ≠ iPhone 14 Pro (accessoire homonyme)", () => {
    expect(
      nameMatchesSufficiently(
        "Câble USB-C iPhone",
        "Apple iPhone 14 Pro 256go",
      )
    ).toBe(false);
  });

  it("🚨 Chargeur iPhone ≠ iPhone 15 (accessoire homonyme)", () => {
    expect(
      nameMatchesSufficiently(
        "Chargeur rapide iPhone 20W",
        "Apple iPhone 15 256go",
      )
    ).toBe(false);
  });

  it("🚨 Nom déclaré vide → refus", () => {
    expect(nameMatchesSufficiently("", "Apple iPhone 14 Pro")).toBe(false);
  });

  it("🚨 Texte API vide → refus", () => {
    expect(nameMatchesSufficiently("iPhone 14 Pro", "")).toBe(false);
  });

  it("🚨 null/undefined → refus", () => {
    expect(nameMatchesSufficiently(null, "Apple iPhone 14 Pro")).toBe(false);
    expect(nameMatchesSufficiently("iPhone 14 Pro", null)).toBe(false);
  });

  it("🚨 MacBook Air ≠ MacBook Pro (modèle différent)", () => {
    expect(
      nameMatchesSufficiently(
        "MacBook Air M2 2022",
        "Apple MacBook Pro M2 2022",
      )
    ).toBe(false);
  });

  it("🚨 Galaxy S22 ≠ Galaxy S23 (génération différente)", () => {
    expect(
      nameMatchesSufficiently(
        "Samsung Galaxy S22 Ultra",
        "Samsung Galaxy S23 Ultra 256go",
      )
    ).toBe(false);
  });

  it("🚨 iPhone 14 Pro ≠ iPhone 14 Pro Max (variante différente)", () => {
    expect(
      nameMatchesSufficiently(
        "iPhone 14 Pro Max 256 Go",
        "Apple iPhone 14 Pro 256go Noir",
      )
    ).toBe(false);
  });

  it("🚨 iPhone 14 Pro Max ≠ iPhone 14 Pro (nom déclaré plus long)", () => {
    expect(
      nameMatchesSufficiently(
        "iPhone 14 Pro",
        "Apple iPhone 14 Pro Max 256go",
      )
    ).toBe(false);
  });

  it("🚨 iPad Air ≠ iPad Pro (gamme différente)", () => {
    expect(
      nameMatchesSufficiently(
        "iPad Air M2 11 pouces 256 Go",
        "Apple iPad Pro M2 11p 256go",
      )
    ).toBe(false);
  });
});
