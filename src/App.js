/// App.js
import React, { useState, useEffect } from "react";

import VerCartera from "./VerCartera";
import VerPolizas from "./VerPolizas";
import PolizasFinanciadas from "./PolizasFinanciadas";
import Login from "./Login";

console.log("VerCartera:", typeof VerCartera, VerCartera);
console.log("VerPolizas:", typeof VerPolizas, VerPolizas);
console.log("PolizasFinanciadas:", typeof PolizasFinanciadas, PolizasFinanciadas);
console.log("Login:", typeof Login, Login);

const PASSWORD_POLIZAS = "1234"; // <-- CAMBIA AQUÍ TU CONTRASEÑA

export default function App() {
  const [online, setOnline] = useState(navigator.onLine);
  const [conexionRestaurada, setConexionRestaurada] = useState(false);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      setConexionRestaurada(true);
      setTimeout(() => setConexionRestaurada(false), 3000);
    };

    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const [logueado, setLogueado] = useState(
    localStorage.getItem("logueado") === "true"
  );

  const [vista, setVista] = useState("cartera");
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const [polizasAutorizadas, setPolizasAutorizadas] = useState(false);
  const [mostrarModalPolizas, setMostrarModalPolizas] = useState(false);
  const [passPolizas, setPassPolizas] = useState("");
  const [verPass, setVerPass] = useState(false);
  const [errorPass, setErrorPass] = useState("");
  const [destinoPolizas, setDestinoPolizas] = useState("polizas");

  const cerrarSesion = () => {
    setLogueado(false);
    setVista("cartera");
    localStorage.removeItem("logueado");
    setPolizasAutorizadas(false);
    setMostrarModalPolizas(false);
    setPassPolizas("");
    setErrorPass("");
    setVerPass(false);
    setDestinoPolizas("polizas");
  };

  const irACartera = () => setVista("cartera");

  const pedirPasswordYIr = (destino) => {
    setDestinoPolizas(destino);
    setErrorPass("");
    setPassPolizas("");
    setVerPass(false);
    setMostrarModalPolizas(true);
  };

  const confirmarPasswordPolizas = () => {
    if (!passPolizas.trim()) {
      setErrorPass("Ingresa la contraseña.");
      return;
    }

    if (passPolizas === PASSWORD_POLIZAS) {
      setPolizasAutorizadas(true);
      setVista(destinoPolizas);
      setMostrarModalPolizas(false);
      setPassPolizas("");
      setErrorPass("");
      setVerPass(false);
    } else {
      setErrorPass("Contraseña incorrecta.");
    }
  };

  const cerrarModalPolizas = () => {
    setMostrarModalPolizas(false);
    setPassPolizas("");
    setErrorPass("");
    setVerPass(false);
    setDestinoPolizas("polizas");
  };

  // LOGIN
  if (!logueado) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Login
          onLogin={() => {
            setLogueado(true);
            localStorage.setItem("logueado", "true");
          }}
        />
      </div>
    );
  }

  return (
    <>
      {!online && (
        <div
          style={{
            background: "#fde047",
            padding: "8px",
            textAlign: "center",
            fontWeight: "bold",
          }}
        >
          ⚠️ Estás trabajando sin conexión
        </div>
      )}

      {conexionRestaurada && (
        <div
          style={{
            background: "#22c55e",
            padding: "8px",
            textAlign: "center",
            fontWeight: "bold",
            color: "white",
          }}
        >
          🟢 Conexión restaurada — sincronizando cambios...
        </div>
      )}

      <div className="min-h-screen bg-gray-50">
        {/* Barra superior */}
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-lg font-semibold text-gray-800">
              Aseguramos JL - Gestión
            </h1>

            <div className="flex flex-wrap gap-2 items-center">
              <button
                onClick={irACartera}
                className={`px-4 py-2 rounded font-medium transition ${
                  vista === "cartera"
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Cartera
              </button>

              <button
                onClick={() => pedirPasswordYIr("polizas")}
                className={`px-4 py-2 rounded font-medium transition ${
                  vista === "polizas"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Pólizas
              </button>

              <button
                onClick={() => pedirPasswordYIr("polizasFinanciadas")}
                className={`px-4 py-2 rounded font-medium transition ${
                  vista === "polizasFinanciadas"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Pólizas Financiadas
              </button>

              <button
                onClick={cerrarSesion}
                className="px-4 py-2 rounded font-medium bg-red-50 text-red-700 hover:bg-red-100 transition"
              >
                Salir
              </button>

              {installPrompt && (
                <button
                  onClick={() => installPrompt.prompt()}
                  style={{
                    position: "fixed",
                    bottom: "20px",
                    right: "20px",
                    background: "#2563eb",
                    color: "white",
                    padding: "10px 15px",
                    borderRadius: "8px",
                    border: "none",
                    zIndex: 9999,
                  }}
                >
                  📲 Instalar App
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Contenido */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          {vista === "cartera" && <VerCartera />}
          {vista === "polizas" && <VerPolizas />}
          {vista === "polizasFinanciadas" && <PolizasFinanciadas />}
        </div>

        {/* Modal */}
        {mostrarModalPolizas && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={cerrarModalPolizas}
            />

            <div className="relative bg-white w-full max-w-md mx-4 rounded-xl shadow-lg border">
              <div className="p-5 border-b">
                <h2 className="text-lg font-semibold text-gray-800">
                  Acceso a Pólizas
                </h2>
              </div>

              <div className="p-5">
                <input
                  type={verPass ? "text" : "password"}
                  value={passPolizas}
                  onChange={(e) => setPassPolizas(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  autoFocus
                />

                {errorPass && (
                  <p className="mt-2 text-sm text-red-600">{errorPass}</p>
                )}
              </div>

              <div className="p-5 border-t flex justify-end gap-2">
                <button
                  onClick={cerrarModalPolizas}
                  className="px-4 py-2 rounded-lg bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarPasswordPolizas}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white"
                >
                  Entrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}