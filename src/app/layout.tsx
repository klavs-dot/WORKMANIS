import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/lib/toast-context";
import { CompanyProvider } from "@/lib/company-context";
import { BillingProvider } from "@/lib/billing-store";
import { AssetProvider } from "@/lib/assets-store";
import { ClientsProvider } from "@/lib/clients-store";
import { NetworkProvider } from "@/lib/network-store";
import { EmployeesProvider } from "@/lib/employees-store";
import { OrdersProvider } from "@/lib/orders-store";
import { DocumentsProvider } from "@/lib/documents-store";
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
        <SessionProvider>
          <ToastProvider>
            <CompanyProvider>
              <BillingProvider>
                <AssetProvider>
                  <ClientsProvider>
                    <NetworkProvider>
                      <EmployeesProvider>
                        <OrdersProvider>
                          <DocumentsProvider>{children}</DocumentsProvider>
                        </OrdersProvider>
                      </EmployeesProvider>
                    </NetworkProvider>
                  </ClientsProvider>
                </AssetProvider>
              </BillingProvider>
            </CompanyProvider>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
