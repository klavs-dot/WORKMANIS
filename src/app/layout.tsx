import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BillPilot — Finanšu pārvaldība",
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
      <body>{children}</body>
    </html>
  );
}
