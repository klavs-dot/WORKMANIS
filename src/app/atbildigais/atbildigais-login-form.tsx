"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";

export function AtbildigaisLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await signIn("external", {
        email: email.trim(),
        password,
        ownerEmail: ownerEmail.trim(),
        redirect: false,
      });
      if (res?.error) {
        setError(
          res.error === "CredentialsSignin"
            ? "Nepareizs e-pasts vai parole. Pārbaudi arī uzņēmuma e-pastu."
            : res.error
        );
      } else if (res?.ok) {
        // Hard redirect so middleware re-evaluates the new session
        window.location.href = "/noliktava";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login neizdevās");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">E-pasta adrese</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="atbildigais@firma.lv"
          required
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Parole</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Tava parole"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ownerEmail">Uzņēmuma īpašnieka e-pasts</Label>
        <Input
          id="ownerEmail"
          type="email"
          autoComplete="off"
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          placeholder="ipasnieks@uznemums.lv"
          required
        />
        <p className="text-xs text-graphite-500">
          Tas ir tā uzņēmuma īpašnieks, kas Tev pievienoja
          piekļuvi sistēmai.
        </p>
      </div>

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={submitting}
      >
        {submitting ? "Pieslēdz…" : "Pieslēgties"}
      </Button>
    </form>
  );
}
