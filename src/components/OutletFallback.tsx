import { Suspense, type ReactNode } from "react";

/** Keeps the surrounding layout (sidebar/header) on screen while a page chunk loads. */
export function OutletSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-2 animate-pulse" aria-busy="true" aria-label="Loading">
          <div className="h-8 w-48 rounded-md bg-muted" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted/70" />)}
          </div>
          <div className="h-64 rounded-xl bg-muted/50" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
