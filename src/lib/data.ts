import sofa from "@/assets/sofa.jpg";
import bike from "@/assets/bike.jpg";
import office from "@/assets/office.jpg";
import hero from "@/assets/hero.jpg";

export type SpaceSlug = "particuliers" | "destockage" | "dons" | "associations" | "vehicules";

export const spaces: Record<SpaceSlug, { title: string; tagline: string; desc: string; image: string }> = {
  particuliers: { title: "Particuliers", tagline: "L'occasion, à prix plafonné", desc: "Chaque prix est calculé par la plateforme selon le prix neuf, l'âge et l'état. Impossible de dépasser le plafond.", image: sofa },
  destockage: { title: "Déstockage pro", tagline: "Invendus & fins de série", desc: "Mobilier, matériel et stocks d'entreprise. Vendeurs vérifiés (SIRET), facture obligatoire, plafond dégressif par lot.", image: office },
  dons: { title: "Dons immédiats", tagline: "Gratuit, tout de suite", desc: "Des objets offerts à qui vient les chercher. Premier arrivé, premier servi.", image: hero },
  associations: { title: "Dons aux associations", tagline: "Réemploi solidaire — loi AGEC", desc: "Espace réservé aux associations vérifiées pour récupérer les invendus non alimentaires des professionnels.", image: office },
  vehicules: { title: "Véhicules", tagline: "Un moteur de prix dédié", desc: "Plafond calculé à partir de la cote et du kilométrage. Vélos, scooters, voitures, utilitaires.", image: bike },
};

export type Listing = {
  id: string; space: SpaceSlug; title: string; price: number; cap: number; newPrice?: number;
  city: string; image: string; condition: string; seller: string; description: string; posted: string;
};

export const listings: Listing[] = [
  { id: "canape-velours", space: "particuliers", title: "Canapé 3 places en velours vert", price: 89, cap: 96, newPrice: 1200, city: "Lyon 6e", image: sofa, condition: "Très bon état", seller: "Claire M.", description: "Canapé confortable, pieds en bois tourné, aucune tache. À récupérer sur place, 2e étage sans ascenseur.", posted: "Il y a 2 h" },
  { id: "velo-ville", space: "vehicules", title: "Vélo de ville vert avec panier", price: 60, cap: 65, newPrice: 450, city: "Nantes", image: bike, condition: "Bon état", seller: "Julien R.", description: "Vélo 3 vitesses, panier osier, révisé récemment. Taille M.", posted: "Hier" },
  { id: "lot-fauteuils", space: "destockage", title: "Lot de 40 fauteuils de bureau ergonomiques", price: 35, cap: 36, newPrice: 240, city: "La Défense", image: office, condition: "Lot pro — fin de bail", seller: "Atelier Nord SAS", description: "Fauteuils maille, accoudoirs réglables. Prix unitaire HT, facture fournie. Enlèvement sur site.", posted: "Il y a 3 j" },
  { id: "fauteuil-bergere", space: "dons", title: "Fauteuil bergère à donner", price: 0, cap: 0, city: "Paris 11e", image: hero, condition: "Usé mais solide", seller: "Sophie L.", description: "Je déménage, il cherche une nouvelle maison. À venir chercher avant samedi.", posted: "Il y a 40 min" },
  { id: "bureaux-asso", space: "associations", title: "12 bureaux pour association", price: 0, cap: 0, city: "Lille", image: office, condition: "Bon état", seller: "Groupe Hexa", description: "Don réservé aux associations vérifiées. Attestation de don remise pour la traçabilité AGEC.", posted: "Il y a 5 j" },
  { id: "canape-2", space: "particuliers", title: "Méridienne vintage", price: 45, cap: 52, newPrice: 650, city: "Bordeaux", image: sofa, condition: "Bon état", seller: "Marc T.", description: "Assise ferme, petite usure sur l'accoudoir gauche.", posted: "Il y a 1 j" },
];

export const getListing = (id: string) => listings.find((l) => l.id === id);
