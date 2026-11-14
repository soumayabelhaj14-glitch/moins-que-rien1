export const formatEUR = (v: number) =>
  v === 0 ? "Gratuit" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
