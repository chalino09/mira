import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { MiraWordmark } from "@/components/brand/MiraBrand";
import { PageTitle } from "@/components/ui/PageTitle";

export function RouteAccessDenied({ returnHref, returnLabel = "Ir a mi espacio" }: { returnHref: string; returnLabel?: string }) {
  return (
    <section>
      <div className="mb-10 border-b border-app-border pb-7 pt-8 md:pt-10">
        <MiraWordmark className="mb-4 block text-[11px] tracking-[0.36em] text-app-muted" />
        <PageTitle>
          Acceso restringido
        </PageTitle>
        <p className="mt-5 max-w-2xl text-sm leading-6 text-app-muted">
          No tienes permiso para abrir recursos de esta empresa.
        </p>
      </div>
      <Link
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-app-border bg-white px-3 text-sm font-medium text-app-text transition hover:bg-app-sidebar"
        href={returnHref}
      >
        <ArrowLeft className="h-4 w-4" />
        {returnLabel}
      </Link>
    </section>
  );
}
