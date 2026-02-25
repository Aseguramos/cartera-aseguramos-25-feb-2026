import React, { useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { auth } from "./firebase";

export default function ConfirmarPassword({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const confirmar = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user || !user.email) {
        setError("Sesión no válida.");
        setLoading(false);
        return;
      }

      const cred = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, cred);

      onSuccess(); // ✅ contraseña correcta
    } catch (err) {
      setError("Contraseña incorrecta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form
        onSubmit={confirmar}
        className="bg-white rounded shadow p-5 w-full max-w-sm"
      >
        <h2 className="text-lg font-semibold">Confirmar contraseña</h2>
        <p className="text-sm text-gray-600 mt-1">
          Por seguridad, confirma tu contraseña para entrar a Pólizas.
        </p>

        <input
          type="password"
          className="border rounded px-3 py-2 w-full mt-4"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <div className="text-red-600 text-sm mt-2">{error}</div>
        )}

        <button
          className="mt-4 bg-blue-600 text-white rounded px-3 py-2 w-full disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Verificando…" : "Confirmar"}
        </button>
      </form>
    </div>
  );
}