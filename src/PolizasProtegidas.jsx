import React, { useState } from "react";
import ConfirmarPassword from "./ConfirmarPassword";
import VerPolizas from "./VerPolizas";

export default function PolizasProtegidas() {
  const [confirmado, setConfirmado] = useState(false);

  if (!confirmado) {
    return <ConfirmarPassword onSuccess={() => setConfirmado(true)} />;
  }

  return <VerPolizas />;
}