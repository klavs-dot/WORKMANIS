/**
 * Custom 404 page. Renders when Next.js can't match the requested
 * URL to any route. Replaces the default white "404 — This page
 * could not be found." with a localised, on-brand variant.
 */

import Link from "next/link";
import { Compass, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-graphite-100 text-graphite-700 mb-4">
          <Compass className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight text-graphite-900">
          404
        </h1>
        <p className="mt-1 text-[15px] font-medium text-graphite-700">
          Lapa nav atrasta
        </p>
        <p className="mt-2 text-[13px] text-graphite-500 leading-relaxed">
          Šis URL neeksistē vai ir pārvietots. Iespējams, esi sekojis vecai
          saitei vai ievadījis adresi nepareizi.
        </p>
        <Button asChild size="sm" className="mt-6">
          <Link href="/">
            <ArrowLeft className="h-3.5 w-3.5" />
            Uz sākumu
          </Link>
        </Button>
      </Card>
    </div>
  );
}
