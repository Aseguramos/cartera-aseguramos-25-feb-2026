import React, { useState, useEffect } from "react";
import { db } from "./firebase";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
} from "firebase/firestore";

// ✅ Referencia Firestore (una sola, afuera)
const refFinanciadas = collection(db, "polizasFinanciadas");

function getSemaforo(poliza) {
  if (poliza.endoso === "") return "rojo";

  const baseCompleta =
    poliza.montada && poliza.recaudada && poliza.firmada && poliza.desembolsada;

  const baseParcial =
    poliza.montada || poliza.recaudada || poliza.firmada || poliza.desembolsada;

  // 🟡 Delegada
  if (poliza.delegada) {
    if (poliza.endoso === "SI") {
      if (baseCompleta && poliza.certificacion && poliza.correoEndoso) return "verde";
    } else {
      if (baseCompleta) return "verde";
    }
    return "amarillo";
  }

  // 🟣 ENDOSO SI
  if (poliza.endoso === "SI") {
    if (baseCompleta && poliza.certificacion && poliza.correoEndoso) return "verde";
    if (baseParcial || poliza.certificacion) return "amarillo";
    return "rojo";
  }

  // 🟢 ENDOSO NO
  if (baseCompleta) return "verde";
  if (baseParcial) return "amarillo";

  return "rojo";
}

export default function PolizasFinanciadas() {
  const entidadesLista = [
    "Finesa",
    "Previcredito",
    "Crediestado",
    "Credivalores",
    "ALLIANZ",
    "ESTADO",
    "SURA",
    "MUNDIAL",
    "PREVISORA",
    "AXA COLPATRIA",
    "MAPFRE",
    "SBS",
    "SOLIDARIA",
    "HDI",
  ];

  const aseguradorasLista = [
    "ALLIANZ",
    "ESTADO",
    "SURA",
    "MUNDIAL",
    "PREVISORA",
    "AXA COLPATRIA",
    "MAPFRE",
    "SBS",
    "SOLIDARIA",
    "HDI",
  ];

  const [carteraReal, setCarteraReal] = useState([]);
  const [polizas, setPolizas] = useState([]); // ✅ SOLO Firestore manda

  // (Dejas esto tal cual lo tenías, por si lo usas después)
  useEffect(() => {
    const cargarCartera = async () => {
      const querySnapshot = await getDocs(collection(db, "cartera"));
      const datos = querySnapshot.docs.map((d) => d.data());
      setCarteraReal(datos);
    };
    cargarCartera();
  }, []);

  // ✅ Cargar en tiempo real SOLO las financiadas desde Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(refFinanciadas, (snap) => {
      const datos = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.tipo === "financiada");

      setPolizas(datos);
    });

    return () => unsubscribe();
  }, []);

  // ✅ Plantilla limpia para nuevas
  const plantillaNueva = () => ({
    numeroPoliza: "",
    fecha: "",
    placa: "",
    nombre: "",
    entidad: "Finesa",
    aseguradora: "SURA",
    gestor: "",
    cuotas: 1,
    valor: "",
    montada: false,
    recaudada: false,
    firmada: false,
    endoso: "",
    certificacion: false,
    correoEndoso: false,
    desembolsada: false,
    delegada: false,
    delegadaA: "",
    tipo: "financiada",
    createdAt: Date.now(),
  });

  // ✅ Crear en Firestore (y listo, el onSnapshot la trae)
  const agregarPoliza = async () => {
    try {
      await addDoc(refFinanciadas, plantillaNueva());
    } catch (error) {
      console.error("❌ Error creando póliza financiada:", error);
      alert("Error creando póliza. Revisa consola y permisos de Firebase.");
    }
  };

  // ✅ Guardar cambios por campo (Firestore)
  const guardarCampo = async (id, patch) => {
    try {
      await updateDoc(doc(db, "polizasFinanciadas", id), patch);
    } catch (error) {
      console.error("❌ Error guardando cambio:", error);
      alert("No se pudo guardar el cambio. Revisa permisos o conexión.");
    }
  };

  // ✅ Eliminar una póliza (Firestore)
  const eliminarPoliza = async (id) => {
    const ok = window.confirm("¿Seguro que quieres eliminar esta póliza financiada?");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "polizasFinanciadas", id));
    } catch (error) {
      console.error("❌ Error eliminando póliza:", error);
      alert("No se pudo eliminar. Revisa permisos o conexión.");
    }
  };

  // ✅ Borrar TODO (solo las financiadas)
  const borrarTodo = async () => {
    const ok = window.confirm("⚠️ Esto eliminará TODAS las pólizas financiadas. ¿Continuar?");
    if (!ok) return;

    try {
      // polizas ya viene filtrado por tipo financiada
      for (const p of polizas) {
        await deleteDoc(doc(db, "polizasFinanciadas", p.id));
      }
    } catch (error) {
      console.error("❌ Error borrando todo:", error);
      alert("No se pudo borrar todo. Revisa permisos o conexión.");
    }
  };

  return (
    <div className="pl-0 pr-4 pt-4 pb-4 w-full text-left">
      <h2 className="text-xl font-bold mb-4">Pólizas Financiadas</h2>

      <div className="flex gap-3 mb-4">
        <button
          onClick={agregarPoliza}
          className="bg-green-600 text-white px-4 py-2 rounded-lg"
        >
          + Póliza Nueva
        </button>

        <button
          onClick={borrarTodo}
          className="bg-red-600 text-white px-4 py-2 rounded-lg"
        >
          🗑 Borrar TODO
        </button>
      </div>

      <table className="w-full border table-auto -ml-64">
        <thead className="bg-gray-100">
          <tr>
            <th>Estado</th>
            <th>Fecha</th>
            <th>Póliza</th>
            <th>Aseguradora</th>
            <th>Placa</th>
            <th>Nombre</th>
            <th>Entidad</th>
            <th>cuotas</th>
            <th>Valor</th>
            <th>Montada</th>
            <th>Recaudada</th>
            <th>Firmada</th>
            <th>Desemb.</th>
            <th>Endoso</th>
            <th>Certif.</th>
            <th>Correo Endoso</th>
            <th>Deleg.</th>
            <th>Delegada a</th>
            <th>Gestor</th>
            <th>Accion</th>
          </tr>
        </thead>

        <tbody>
          {polizas.map((p) => {
            const estado = getSemaforo(p);

            return (
              <tr key={p.id} className="border-b">
                <td>
                  <div className="flex items-start gap-3">
                    {/* 🔵 SEMÁFORO GENERAL GRANDE */}
                    <div>
                      <span
                        className={`inline-flex items-center justify-center w-9 h-9 rounded-full border-2 border-white shadow-lg ${
                          estado === "verde"
                            ? "bg-green-500"
                            : estado === "amarillo"
                            ? "bg-yellow-400"
                            : "bg-red-500"
                        } ${
                          p.endoso === "SI" && p.desembolsada && !p.certificacion
                            ? "animate-pulse"
                            : ""
                        }`}
                      />
                    </div>
                  </div>

                  {/* 🧾 DETALLE PROCESO */}
                  <div className="flex flex-col gap-1 text-xs">
                    {p.montada && <span className="text-blue-600">🔵 Montada</span>}
                    {p.recaudada && <span className="text-purple-600">🟣 Recaudada</span>}
                    {p.firmada && <span className="text-green-600">🟢 Firmada</span>}
                    {p.desembolsada && (
                      <span className="text-green-700">💰 Desembolsada</span>
                    )}

                    {p.endoso === "SI" && !p.certificacion && p.desembolsada && (
                      <span className="text-orange-500">📄 Certificación pendiente</span>
                    )}

                    {p.endoso === "SI" && p.certificacion && !p.correoEndoso && (
                      <span className="text-orange-500">📩 Correo Endoso pendiente</span>
                    )}

                    {estado === "verde" && (
                      <span className="text-green-700 font-semibold">
                        ✔ PROCESO FINALIZADO
                      </span>
                    )}
                  </div>
                </td>

                <td>
                  <input
                    type="date"
                    value={p.fecha || ""}
                    onChange={(e) => guardarCampo(p.id, { fecha: e.target.value })}
                    className="border rounded px-2 py-1"
                  />
                </td>

                <td>
                  <input
                    value={p.numeroPoliza || ""}
                    onChange={(e) =>
                      guardarCampo(p.id, { numeroPoliza: e.target.value })
                    }
                    className="border rounded px-2 py-1 w-28"
                  />
                </td>

                <td>
                  <select
                    value={p.aseguradora || "SURA"}
                    onChange={(e) => guardarCampo(p.id, { aseguradora: e.target.value })}
                    className="border rounded px-2 py-1"
                  >
                    {aseguradorasLista.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </td>

                <td>
                  <input
                    value={p.placa || ""}
                    onChange={(e) =>
                      guardarCampo(p.id, { placa: (e.target.value || "").toUpperCase() })
                    }
                    className="border rounded px-2 py-1 w-24"
                  />
                </td>

                <td>
                  <input
                    value={p.nombre || ""}
                    onChange={(e) => guardarCampo(p.id, { nombre: e.target.value })}
                    className="border rounded px-2 py-1 w-32"
                  />
                </td>

                <td>
                  <select
                    value={p.entidad || "Finesa"}
                    onChange={(e) => guardarCampo(p.id, { entidad: e.target.value })}
                    className="border rounded px-2 py-1"
                  >
                    {entidadesLista.map((ent) => (
                      <option key={ent}>{ent}</option>
                    ))}
                  </select>
                </td>

                <td>
                  <select
                    value={Number(p.cuotas || 1)}
                    onChange={(e) =>
                      guardarCampo(p.id, { cuotas: Number(e.target.value) })
                    }
                    className="border rounded px-2 py-1"
                  >
                    {[...Array(12)].map((_, i) => (
                      <option key={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </td>

                <td>
                  <input
                    value={p.valor || ""}
                    onChange={(e) => guardarCampo(p.id, { valor: e.target.value })}
                    className="border rounded px-2 py-1 w-28"
                  />
                </td>

                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={!!p.montada}
                    onChange={(e) => guardarCampo(p.id, { montada: e.target.checked })}
                  />
                </td>

                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={!!p.recaudada}
                    disabled={!p.montada}
                    onChange={(e) => guardarCampo(p.id, { recaudada: e.target.checked })}
                  />
                </td>

                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={!!p.firmada}
                    disabled={!p.recaudada}
                    onChange={(e) => guardarCampo(p.id, { firmada: e.target.checked })}
                  />
                </td>

                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={!!p.desembolsada}
                    disabled={!p.montada || !p.recaudada || !p.firmada}
                    onChange={(e) =>
                      guardarCampo(p.id, { desembolsada: e.target.checked })
                    }
                  />
                </td>

                <td className="text-center">
                  <select
                    value={p.endoso || ""}
                    onChange={(e) => guardarCampo(p.id, { endoso: e.target.value })}
                    className="border rounded px-1"
                  >
                    <option value="">-</option>
                    <option value="SI">SI</option>
                    <option value="NO">NO</option>
                  </select>
                </td>

                <td className="text-center">
                  {p.endoso === "SI" && (
                    <input
                      type="checkbox"
                      checked={!!p.certificacion}
                      disabled={!p.desembolsada}
                      onChange={(e) =>
                        guardarCampo(p.id, { certificacion: e.target.checked })
                      }
                    />
                  )}
                </td>

                {/* 🆕 CORREO ENDOSO */}
                <td className="text-center">
                  {p.endoso === "SI" && p.certificacion && (
                    <select
                      value={p.correoEndoso ? "SI" : "NO"}
                      onChange={(e) =>
                        guardarCampo(p.id, { correoEndoso: e.target.value === "SI" })
                      }
                      className="border rounded px-1"
                    >
                      <option value="NO">NO</option>
                      <option value="SI">SI</option>
                    </select>
                  )}
                </td>

                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={!!p.delegada}
                    onChange={(e) => guardarCampo(p.id, { delegada: e.target.checked })}
                  />
                </td>

                <td>
                  <input
                    value={p.delegadaA || ""}
                    onChange={(e) => guardarCampo(p.id, { delegadaA: e.target.value })}
                    className="border rounded px-2 py-1 w-32"
                  />
                </td>

                <td>
                  <input
                    value={p.gestor || ""}
                    onChange={(e) => guardarCampo(p.id, { gestor: e.target.value })}
                    className="border rounded px-2 py-1 w-32"
                  />
                </td>

                <td>
                  <button
                    onClick={() => eliminarPoliza(p.id)}
                    className="text-red-600 font-bold px-2"
                    title="Eliminar"
                  >
                    X
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}