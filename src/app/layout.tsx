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
import { WarehouseProvider } from "@/lib/warehouse-store";
import "./globals.css";

export const metadata: Metadata = {
  title: "WORKMANIS — Komandcentrs. Seko biznesam.",
  description:
    "Komandcentrs visu tavu uzņēmumu pārvaldībai — rēķini, maksājumi, noliktava un grāmatvedība vienuviet.",
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
                          <DocumentsProvider>
                            <WarehouseProvider>{children}</WarehouseProvider>
                          </DocumentsProvider>
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
