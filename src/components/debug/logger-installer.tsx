"use client";

import { useEffect } from "react";
import {
  installFetchLogger,
  installErrorLogger,
  log,
} from "@/lib/client-logger";

export function LoggerInstaller() {
  useEffect(() => {
    installFetchLogger();
    installErrorLogger();
    log("info", "Lapas sesija sākta");
  }, []);
  return null;
}
