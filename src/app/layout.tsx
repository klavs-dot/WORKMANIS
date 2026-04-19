import type { Metadata } from "next";
import { CompanyProvider } from "@/lib/company-context";
import { BillingProvider } from "@/lib/billing-store";
import { AssetProvider } from "@/lib/assets-store";
import "./globals.css";

export const metadata: Metadata = {
  title: "WORKMANIS — Uzņēmumu pārvaldība",
  description:
    "Premium tool abonementu, rēķinu un maksājumu pārvaldībai. Visiem jūsu uzņēmumiem vienuviet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="lv">
      <body>
        <CompanyProvider>
          <BillingProvider>
            <AssetProvider>{children}</AssetProvider>
          </BillingProvider>
        </CompanyProvider>
      </body>
    </html>
  );
}
