// src/app/cars/page.tsx
import Link from "next/link";

export default function CarsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Cars
        </h1>
        <Link className="text-sm underline underline-offset-4" href="/">
          Back to search
        </Link>
      </div>

      <p className="mt-6 text-sm text-neutral-700">
        Cars - Placeholder page - We’ll build this after Hotels.
      </p>
    </main>
  );
}