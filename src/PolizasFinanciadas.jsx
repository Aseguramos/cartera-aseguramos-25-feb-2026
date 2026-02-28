import React, { useEffect, useMemo, useState } from "react";
import { db, auth } from "./firebase";

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  collectionGroup,
  getDocs,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

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

  const [polizas, setPolizas] = useState([]);
  const [uid, setUid] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // filtros
  const [filtroSemaforo, setFiltroSemaforo] = useState("todas"); // todas | rojo | amarillo | verde

  // ✅ Sesión (solo para permitir crear/editar si tus reglas lo exigen)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user ? user.uid : null);
      setAuthReady(true);
      console.log("AUTH USER:", user?.email, "UID:", user?.uid);
    });
    return () => unsub();
  }, []);




  
  // ✅ Carga realtime DIRECTO EN RAÍZ: /polizasFinanciadas
  useEffect(() => {
    // Si quieres permitir ver sin sesión, quita este if.
    if (!uid) {
      setPolizas([]);
      return;
    }



    
    if (!uid) {
  setPolizas([]);
  return;
}

const ref = query(
  collection(db, "cartera", uid, "polizasFinanciadas"),
  where("tipo", "==", "financiada")
);

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const datos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPolizas(datos);
      },
      (err) => {
        console.error("❌ onSnapshot financiadas (raíz):", err);
        alert("No se pudo leer pólizas financiadas. Revisa reglas/permisos.");
      }
    );

    return () => unsubscribe();
  }, [uid]);

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
    // ✅ NUEVO
    gestionTexto: "",
    tipo: "financiada",
    createdAt: Date.now(),
  });

const agregarPoliza = async () => {
  if (!uid) return;

  try {
    await addDoc(
      collection(db, "cartera", uid, "polizasFinanciadas"),
      plantillaNueva()
    );
  } catch (error) {
    console.error("❌ Error creando póliza financiada:", error);
    alert("Error creando póliza. Revisa consola y permisos/reglas.");
  }
};

const guardarCampo = async (id, patch) => {
  if (!uid) return;

  try {
    await updateDoc(
      doc(db, "cartera", uid, "polizasFinanciadas", id),
      patch
    );
  } catch (error) {
    console.error("❌ Error guardando cambio:", error);
    alert("No se pudo guardar. Revisa permisos/reglas o conexión.");
  }
};

const eliminarPoliza = async (id) => {
  const ok = window.confirm("¿Seguro que quieres eliminar esta póliza financiada?");
  if (!ok || !uid) return;

  try {
    await deleteDoc(
      doc(db, "cartera", uid, "polizasFinanciadas", id)
    );
  } catch (error) {
    console.error("❌ Error eliminando póliza:", error);
    alert("No se pudo eliminar. Revisa permisos/reglas o conexión.");
  }
};

  const borrarTodo = async () => {
    const ok = window.confirm("⚠️ Esto eliminará TODAS las pólizas financiadas visibles. ¿Continuar?");
    if (!ok || !uid) return;

    try {
      for (const p of dataRender) {
        await deleteDoc(doc(db, "polizasFinanciadas", p.id));
      }
    } catch (error) {
      console.error("❌ Error borrando todo:", error);
      alert("No se pudo borrar todo. Revisa permisos/reglas o conexión.");
    }
  };

  const sinSesion = authReady && !uid;

  // =========================
  // FILTRO + CONTADORES
  // =========================
  const dataRender = useMemo(() => {
    if (filtroSemaforo === "todas") return polizas;
    return polizas.filter((p) => getSemaforo(p) === filtroSemaforo);
  }, [polizas, filtroSemaforo]);

  const contadores = useMemo(() => {
    const total = polizas.length;

    const rojas = polizas.filter((p) => getSemaforo(p) === "rojo").length;
    const amarillas = polizas.filter((p) => getSemaforo(p) === "amarillo").length;
    const verdes = polizas.filter((p) => getSemaforo(p) === "verde").length;

    const montadas = polizas.filter((p) => !!p.montada).length;
    const recaudadas = polizas.filter((p) => !!p.recaudada).length;
    const firmadas = polizas.filter((p) => !!p.firmada).length;
    const desembolsadas = polizas.filter((p) => !!p.desembolsada).length;

    const endosoSi = polizas.filter((p) => (p.endoso || "") === "SI").length;

    const certPend = polizas.filter(
      (p) => (p.endoso || "") === "SI" && !!p.desembolsada && !p.certificacion
    ).length;

    const correoPend = polizas.filter(
      (p) => (p.endoso || "") === "SI" && !!p.certificacion && !p.correoEndoso
    ).length;

    return {
      total,
      rojas,
      amarillas,
      verdes,
      montadas,
      recaudadas,
      firmadas,
      desembolsadas,
      endosoSi,
      certPend,
      correoPend,
    };
  }, [polizas]);

  return (
    <div className="pl-0 pr-4 pt-4 pb-4 w-full text-left">
      <h2 className="text-xl font-bold mb-2">Pólizas Financiadas</h2>

      {!authReady && <div className="text-sm text-gray-500 mb-3">Cargando sesión…</div>}
      {sinSesion && (
        <div className="text-sm text-red-600 mb-3">
          Sin sesión activa. Inicia sesión para ver/agregar pólizas.
        </div>
      )}

      {/* ====== CONTADORES + FILTROS ====== */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <div className="bg-indigo-200 text-indigo-900 px-4 py-2 rounded shadow">
          <b>Total:</b> {contadores.total}
        </div>

        <button
          onClick={() => setFiltroSemaforo("rojo")}
          className={`px-4 py-2 rounded shadow text-white ${
            filtroSemaforo === "rojo" ? "bg-red-700" : "bg-red-500"
          }`}
        >
          Rojas: {contadores.rojas}
        </button>

        <button
          onClick={() => setFiltroSemaforo("amarillo")}
          className={`px-4 py-2 rounded shadow ${
            filtroSemaforo === "amarillo" ? "bg-yellow-500" : "bg-yellow-300"
          }`}
        >
          Amarillas: {contadores.amarillas}
        </button>

        <button
          onClick={() => setFiltroSemaforo("verde")}
          className={`px-4 py-2 rounded shadow text-white ${
            filtroSemaforo === "verde" ? "bg-green-700" : "bg-green-500"
          }`}
        >
          Verdes: {contadores.verdes}
        </button>

        <button
          onClick={() => setFiltroSemaforo("todas")}
          className={`px-4 py-2 rounded shadow ${
            filtroSemaforo === "todas" ? "bg-blue-700 text-white" : "bg-blue-100"
          }`}
        >
          Todas
        </button>
      </div>

      {/* ====== CONTADORES EXTRA ====== */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="bg-blue-100 px-3 py-2 rounded shadow">🔵 Montadas: <b>{contadores.montadas}</b></div>
        <div className="bg-purple-100 px-3 py-2 rounded shadow">🟣 Recaudadas: <b>{contadores.recaudadas}</b></div>
        <div className="bg-green-100 px-3 py-2 rounded shadow">🟢 Firmadas: <b>{contadores.firmadas}</b></div>
        <div className="bg-emerald-100 px-3 py-2 rounded shadow">💰 Desembolsadas: <b>{contadores.desembolsadas}</b></div>
        <div className="bg-gray-100 px-3 py-2 rounded shadow">📝 Endoso SI: <b>{contadores.endosoSi}</b></div>
        <div className="bg-orange-100 px-3 py-2 rounded shadow">📄 Certif. pendientes: <b>{contadores.certPend}</b></div>
        <div className="bg-orange-100 px-3 py-2 rounded shadow">📩 Correo endoso pend.: <b>{contadores.correoPend}</b></div>
      </div>

      {/* ====== BOTONES ====== */}
      <div className="flex gap-3 mb-4">
        <button
          onClick={agregarPoliza}
          disabled={!uid}
          className={`px-4 py-2 rounded-lg text-white ${
            uid ? "bg-green-600" : "bg-green-300 cursor-not-allowed"
          }`}
        >
          + Póliza Nueva
        </button>

        <button
          onClick={borrarTodo}
          disabled={!uid || dataRender.length === 0}
          className={`px-4 py-2 rounded-lg text-white ${
            uid && dataRender.length > 0 ? "bg-red-600" : "bg-red-300 cursor-not-allowed"
          }`}
        >
          🗑 Borrar TODO (filtro actual)
        </button>
      </div>

      {/* ====== TABLA ====== */}
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
            <th>Cuotas</th>
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
            <th>Gestión (texto)</th>
            <th>Acción</th>
          </tr>
        </thead>

        <tbody>
          {dataRender.map((p) => {
            const estado = getSemaforo(p);

            return (
              <tr key={p.id} className="border-b">
                <td>
                  <div className="flex items-start gap-3">
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

                  <div className="flex flex-col gap-1 text-xs">
                    {p.montada && <span className="text-blue-600">🔵 Montada</span>}
                    {p.recaudada && <span className="text-purple-600">🟣 Recaudada</span>}
                    {p.firmada && <span className="text-green-600">🟢 Firmada</span>}
                    {p.desembolsada && <span className="text-green-700">💰 Desembolsada</span>}

                    {p.endoso === "SI" && !p.certificacion && p.desembolsada && (
                      <span className="text-orange-500">📄 Certificación pendiente</span>
                    )}

                    {p.endoso === "SI" && p.certificacion && !p.correoEndoso && (
                      <span className="text-orange-500">📩 Correo Endoso pendiente</span>
                    )}

                    {estado === "verde" && (
                      <span className="text-green-700 font-semibold">✔ PROCESO FINALIZADO</span>
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
                    onChange={(e) => guardarCampo(p.id, { numeroPoliza: e.target.value })}
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
                    onChange={(e) => guardarCampo(p.id, { cuotas: Number(e.target.value) })}
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
                    onChange={(e) => guardarCampo(p.id, { desembolsada: e.target.checked })}
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
                      onChange={(e) => guardarCampo(p.id, { certificacion: e.target.checked })}
                    />
                  )}
                </td>

                <td className="text-center">
                  {p.endoso === "SI" && p.certificacion && (
                    <select
                      value={p.correoEndoso ? "SI" : "NO"}
                      onChange={(e) => guardarCampo(p.id, { correoEndoso: e.target.value === "SI" })}
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

                {/* ✅ NUEVO: GESTION TEXTO */}
                <td>
                  <textarea
                    value={p.gestionTexto || ""}
                    onChange={(e) => guardarCampo(p.id, { gestionTexto: e.target.value })}
                    className="border rounded px-2 py-1 w-64 min-h-[44px]"
                    placeholder="Escribe la gestión…"
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