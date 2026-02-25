import React, { useEffect, useMemo, useState } from "react";
import { db } from "./firebase";
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

/**
 * VERPOLIZAS.jsx
 * - Contadores y filtro ANULADAS basados en el campo p.anulada:
 *   "pendiente" / "confirmada" / "si" / "sí"
 * - NO depende de estadoPorFecha() para saber si es anulada.
 * - Fecha de trabajo: FECHA_EMISION (la que ya estás usando)
 */

const VerPolizas = () => {
  const [polizas, setPolizas] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [aseguradoraSel, setAseguradoraSel] = useState("TODAS");
  const [filtroRapido, setFiltroRapido] = useState("TODOS"); // TODOS | VIGENTES | PROXIMOS | VENCIDAS | ANULADAS
  const [cargando, setCargando] = useState(true);

  // =========================
  // Helpers anuladas (CLAVE)
  // =========================
  const norm = (v) => (v ?? "").toString().trim().toLowerCase();

  const esAnulada = (a) => {
    const v = norm(a);
    return v === "si" || v === "sí" || v === "pendiente" || v === "confirmada";
  };

  const esManualPendiente = (a) => norm(a) === "pendiente";
  const esConfirmada = (a) => norm(a) === "confirmada";

  // =========================
  // Fecha: usamos fecha_emision
  // =========================
  const parseYMD = (ymd) => {
    // ymd: "YYYY-MM-DD"
    if (!ymd || typeof ymd !== "string") return null;
    const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    return isNaN(dt.getTime()) ? null : dt;
  };

  // Estado por fecha SOLO para vigentes/proximas/vencidas
  // (si está anulada => siempre ANULADA)
  const estadoPorFecha = (p) => {
    if (esAnulada(p.anulada)) return "ANULADA";

    const fe = parseYMD(p.fecha_emision);
    if (!fe) return "VIGENTE"; // si falta fecha, no la castigamos

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    fe.setHours(0, 0, 0, 0);

    const diffMs = fe.getTime() - hoy.getTime();
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

    // Tu regla (según lo que vienes usando): hoy o pasado = vencida,
    // 1..5 días = próxima, >25 = vigente.
    // Ajusta si tú ya definiste otra exacta en tu sistema.
    if (diffDias <= 0) return "VENCIDA";
    if (diffDias <= 5) return "PROXIMA";
    return "VIGENTE";
  }

  // =========================
  // Cargar datos Firebase
  // =========================
  useEffect(() => {
    const q = collection(db, "cartera");
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPolizas(arr);
        setCargando(false);
      },
      (err) => {
        console.error("Error onSnapshot cartera:", err);
        setCargando(false);
      }
    );
    return () => unsub();
  }, []);

  // =========================
  // Filtros
  // =========================
  const polizasFiltradas = useMemo(() => {
    let lista = [...polizas];

    // Filtro aseguradora
    if (aseguradoraSel !== "TODAS") {
      lista = lista.filter((p) => (p.aseguradora ?? "") === aseguradoraSel);
    }

    // Búsqueda
    const t = busqueda.trim().toLowerCase();
    if (t) {
      lista = lista.filter((p) => {
        const s = `${p.aseguradora ?? ""} ${p.nombre ?? ""} ${p.documento ?? ""} ${p.placa ?? ""} ${p.ramo ?? ""} ${p.poliza ?? ""} ${p.fecha_emision ?? ""}`.toLowerCase();
        return s.includes(t);
      });
    }

    // Filtros rápidos
    lista = lista.filter((p) => {
      const est = estadoPorFecha(p);

      if (filtroRapido === "TODOS") return true;
      if (filtroRapido === "VIGENTES") return est === "VIGENTE";
      if (filtroRapido === "PROXIMOS") return est === "PROXIMA";
      if (filtroRapido === "VENCIDAS") return est === "VENCIDA";

      // ✅ ESTE ERA EL PROBLEMA: ANULADAS NO se mira por fecha, se mira por p.anulada
      if (filtroRapido === "ANULADAS") return esAnulada(p.anulada);

      return true;
    });

    // Orden: fecha_emision desc, luego póliza
    lista.sort((a, b) => {
      const fa = (a.fecha_emision ?? "").toString();
      const fb = (b.fecha_emision ?? "").toString();
      if (fa && fb && fa !== fb) return fb.localeCompare(fa);
      return (a.poliza ?? "").toString().localeCompare((b.poliza ?? "").toString());
    });

    return lista;
  }, [polizas, busqueda, aseguradoraSel, filtroRapido]);

  // =========================
  // Contadores (SOBRE TODO el dataset)
  // =========================
  const contadores = useMemo(() => {
    let vig = 0,
      pro = 0,
      ven = 0,
      anu = 0;

    polizas.forEach((p) => {
      if (esAnulada(p.anulada)) {
        anu++;
        return;
      }
      const e = estadoPorFecha(p);
      if (e === "VIGENTE") vig++;
      else if (e === "PROXIMA") pro++;
      else if (e === "VENCIDA") ven++;
    });

    return { vig, pro, ven, anu, total: polizas.length };
  }, [polizas]);

  // =========================
  // Acciones anuladas (manual)
  // =========================
  const confirmarAnulacion = async (id) => {
    try {
      await updateDoc(doc(db, "cartera", id), { anulada: "confirmada" });
    } catch (e) {
      console.error("confirmarAnulacion:", e);
      window.alert("❌ No se pudo confirmar la anulación.");
    }
  };

  const reactivarPoliza = async (id) => {
    try {
      await updateDoc(doc(db, "cartera", id), { anulada: "no", vigente: "si" });
    } catch (e) {
      console.error("reactivarPoliza:", e);
      window.alert("❌ No se pudo reactivar.");
    }
  };

  const borrarPoliza = async (id) => {
    if (!window.confirm("¿Seguro que deseas borrar definitivamente esta póliza?")) return;
    try {
      await deleteDoc(doc(db, "cartera", id));
    } catch (e) {
      console.error("borrarPoliza:", e);
      window.alert("❌ No se pudo borrar.");
    }
  };

  // =========================
  // Exportar Excel
  // =========================
  const exportarExcel = () => {
    try {
      const rows = polizasFiltradas.map((p) => ({
        Aseguradora: p.aseguradora ?? "",
        Nombre: p.nombre ?? "",
        Documento: p.documento ?? "",
        Asesor: p.asesor ?? "",
        Placa: p.placa ?? "",
        Ramo: p.ramo ?? "",
        Poliza: p.poliza ?? "",
        "Fecha Emisión": p.fecha_emision ?? "",
        Vigente: p.vigente ?? "",
        Anulada: p.anulada ?? "",
        Gestión: p.gestion ?? "",
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Cartera");

      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([out], { type: "application/octet-stream" });
      saveAs(blob, "cartera.xlsx");
    } catch (e) {
      console.error("exportarExcel:", e);
      window.alert("❌ No se pudo exportar.");
    }
  };

  // Aseguradoras para selector
  const aseguradoras = useMemo(() => {
    const set = new Set(polizas.map((p) => (p.aseguradora ?? "").trim()).filter(Boolean));
    return ["TODAS", ...Array.from(set).sort()];
  }, [polizas]);

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="font-semibold text-lg">Total Cartera: {contadores.total}</div>

        <button
          className={`px-3 py-1 rounded ${filtroRapido === "TODOS" ? "bg-blue-700 text-white" : "bg-gray-200"}`}
          onClick={() => setFiltroRapido("TODOS")}
        >
          Todos
        </button>

        <button
          className={`px-3 py-1 rounded ${filtroRapido === "VIGENTES" ? "bg-green-700 text-white" : "bg-gray-200"}`}
          onClick={() => setFiltroRapido("VIGENTES")}
        >
          Vigentes: {contadores.vig}
        </button>

        <button
          className={`px-3 py-1 rounded ${filtroRapido === "PROXIMOS" ? "bg-yellow-500 text-white" : "bg-gray-200"}`}
          onClick={() => setFiltroRapido("PROXIMOS")}
        >
          Próximos: {contadores.pro}
        </button>

        <button
          className={`px-3 py-1 rounded ${filtroRapido === "VENCIDAS" ? "bg-red-700 text-white" : "bg-gray-200"}`}
          onClick={() => setFiltroRapido("VENCIDAS")}
        >
          Vencidas: {contadores.ven}
        </button>

        <button
          className={`px-3 py-1 rounded ${filtroRapido === "ANULADAS" ? "bg-orange-600 text-white" : "bg-gray-200"}`}
          onClick={() => setFiltroRapido("ANULADAS")}
        >
          Anuladas: {contadores.anu}
        </button>

        <select
          className="border rounded px-2 py-1 ml-auto"
          value={aseguradoraSel}
          onChange={(e) => setAseguradoraSel(e.target.value)}
        >
          {aseguradoras.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <input
          className="border rounded px-2 py-1 w-full sm:w-80"
          placeholder="Buscar por nombre, póliza, placa..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />

        <button className="px-3 py-1 rounded bg-purple-700 text-white" onClick={exportarExcel}>
          Exportar a Excel
        </button>
      </div>

      {cargando ? (
        <div className="text-gray-600">Cargando cartera...</div>
      ) : (
        <div className="overflow-auto border rounded">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left">Aseguradora</th>
                <th className="p-2 text-left">Nombre</th>
                <th className="p-2 text-left">Documento</th>
                <th className="p-2 text-left">Asesor</th>
                <th className="p-2 text-left">Placa</th>
                <th className="p-2 text-left">Ramo</th>
                <th className="p-2 text-left">Póliza</th>
                <th className="p-2 text-left">Fecha Emisión</th>
                <th className="p-2 text-left">Estado</th>
                <th className="p-2 text-left">Anulada</th>
                <th className="p-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {polizasFiltradas.map((p) => {
                const est = estadoPorFecha(p);
                const a = norm(p.anulada);
                const esA = esAnulada(p.anulada);

                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">{p.aseguradora || "—"}</td>
                    <td className="p-2">{p.nombre || "—"}</td>
                    <td className="p-2">{p.documento || "—"}</td>
                    <td className="p-2">{p.asesor || "—"}</td>
                    <td className="p-2">{p.placa || "—"}</td>
                    <td className="p-2">{p.ramo || "—"}</td>
                    <td className="p-2">{p.poliza || "—"}</td>
                    <td className="p-2">{p.fecha_emision || "—"}</td>
                    <td className="p-2">{est}</td>
                    <td className="p-2">{p.anulada || "no"}</td>

                    <td className="p-2 flex gap-2">
                      {a === "pendiente" && (
                        <button
                          className="px-2 py-1 rounded bg-orange-600 text-white"
                          onClick={() => confirmarAnulacion(p.id)}
                        >
                          Confirmar
                        </button>
                      )}

                      {esA && a !== "pendiente" && (
                        <button className="px-2 py-1 rounded bg-gray-300" onClick={() => reactivarPoliza(p.id)}>
                          Reactivar
                        </button>
                      )}

                      <button className="px-2 py-1 rounded bg-red-700 text-white" onClick={() => borrarPoliza(p.id)}>
                        Borrar
                      </button>
                    </td>
                  </tr>
                );
              })}

              {polizasFiltradas.length === 0 && (
                <tr>
                  <td className="p-4 text-center text-gray-500" colSpan={11}>
                    No hay resultados con este filtro/búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default VerPolizas;