import { AlertTriangle } from "lucide-react";

export function ProvisionalBanner() {
  return (
    <div className="flex gap-3 rounded-2xl border border-sun bg-sun/20 p-4 text-sm">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <p>
        <strong>Barèmes provisoires, non validés juridiquement.</strong> Les plafonds affichés servent à tester et ajuster les coefficients
        avant la mise en service. Les valeurs marquées « hypothèse » ne sont pas définitives.
      </p>
    </div>
  );
}
