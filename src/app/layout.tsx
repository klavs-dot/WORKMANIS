import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { ReducedMotionProvider } from "@/components/layout/reduced-motion-provider";
import { ToastProvider } from "@/lib/toast-context";
import { ConfirmProvider } from "@/lib/confirm-context";
import { CompanyProvider } from "@/lib/company-context";
import { BillingProvider } from "@/lib/billing-store";
import { AssetProvider } from "@/lib/assets-store";
import { ClientsProvider } from "@/lib/clients-store";
import { NetworkProvider } from "@/lib/network-store";
import { EmployeesProvider } from "@/lib/employees-store";
import { OrdersProvider } from "@/lib/orders-store";
import { DocumentsProvider } from "@/lib/documents-store";
import { WarehouseProvider } from "@/lib/warehouse-store";
import { PaymentsProvider } from "@/lib/payments-store";
import { LoggerInstaller } from "@/components/debug/logger-installer";
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
         <ReducedMotionProvider>
          <LoggerInstaller />
          <ToastProvider>
           <ConfirmProvider>
            <CompanyProvider>
              <BillingProvider>
                <AssetProvider>
                  <ClientsProvider>
                    <NetworkProvider>
                      <EmployeesProvider>
                        <OrdersProvider>
                          <DocumentsProvider>
                            <WarehouseProvider>
                              <PaymentsProvider>{children}</PaymentsProvider>
                            </WarehouseProvider>
                          </DocumentsProvider>
                        </OrdersProvider>
                      </EmployeesProvider>
                    </NetworkProvider>
                  </ClientsProvider>
                </AssetProvider>
              </BillingProvider>
            </CompanyProvider>
           </ConfirmProvider>
          </ToastProvider>
         </ReducedMotionProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
