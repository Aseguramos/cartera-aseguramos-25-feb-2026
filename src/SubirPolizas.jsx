import React, { useState } from "react";
import * as XLSX from "xlsx";
import {
  collection,
  getDocs,
  doc,
  writeBatch,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * SubirPolizas.jsx
 * - Importa Excel y sube a Firestore (colección: "polizas")
 * - Clave única por póliza: aseguradora + poliza
 * - Conserva: gestion, renovacion, comision, telefono (si ya existían en Firestore)
 * - Mapea encabezados comunes (mayúsculas / tildes / variantes)
 */

export default function SubirPolizas({ onDone }) {
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  // =========================
  // Helpers normalización
  // =========================
  const norm = (v) =>
    String(v ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const toSI = (v) => {
    if (typeof v === "boolean") return v ? "SI" : "NO";
    const s = norm(v).toUpperCase();
    if (s === "SI" || s === "SÍ" || s === "TRUE" || s === "1") return "SI";
    if (s === "NO" || s === "FALSE" || s === "0") return "NO";
    return "NO";
  };

  const parseNumber = (v) => {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    const s = String(v).replace(/\./g, "").replace(",", ".").trim();
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };

  // =========================
  // Fechas
  // =========================
  const pad2 = (n) => String(n).padStart(2, "0");

  const toDateSafe = (value) => {
    if (value === null || value === undefined || value === "") return null;

    // Excel serial
    if (typeof value === "number" && isFinite(value)) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(excelEpoch.getTime() + value * 86400000);
      return isNaN(d.getTime()) ? null : d;
    }

    // Date
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }

    // String
    if (typeof value === "string") {
      const s = value.trim();
      if (!s) return null;

      // YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(s + "T00:00:00");
        return isNaN(d.getTime()) ? null : d;
      }

      // YYYY/MM/DD
      if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) {
        const parts = s.split("/");
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const da = parseInt(parts[2], 10);
        const dt = new Date(y, m - 1, da);
        return isNaN(dt.getTime()) ? null : dt;
      }

      // DD/MM/YYYY
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
        const parts = s.split("/");
        const da = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        const dt = new Date(y, m - 1, da);
        return isNaN(dt.getTime()) ? null : dt;
      }

      // fallback
      const dt = new Date(s);
      return isNaN(dt.getTime()) ? null : dt;
    }

    return null;
  };

  const formatYMD = (value) => {
    const d = toDateSafe(value);
    if (!d) return "";
    const y = String(d.getFullYear());
    const m = pad2(d.getMonth() + 1);
    const da = pad2(d.getDate());
    return y + "-" + m + "-" + da;
  };

  // =========================
  // Encabezados (map)
  // =========================
  const pick = (row, keys) => {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
        return row[k];
      }
    }
    return "";
  };

  // crea un id estable, sin espacios raros
  const makeId = (aseguradora, poliza) => {
    const a = norm(aseguradora).replace(/\s+/g, "_");
    const p = norm(poliza).replace(/\s+/g, "_");
    return (a + "" + p).replace(/[^a-z0-9_]+/g, "_");
  };

  // =========================
  // Importación principal
  // =========================
  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setCargando(true);
    setMensaje("Leyendo Excel...");

    try {
      // 1) Leer Excel
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!rows || rows.length === 0) {
        setMensaje("El Excel está vacío.");
        setCargando(false);
        return;
      }

      // 2) Cargar existentes para conservar gestion/renovacion/comision/telefono
      setMensaje("Leyendo pólizas existentes en Firestore...");
      const snap = await getDocs(collection(db, "polizas"));
      const existentes = {};
      snap.docs.forEach((d) => {
        const data = d.data() || {};
        const a = data.aseguradora || "";
        const p = data.poliza || "";
        const key = makeId(a, p);
        existentes[key] = { id: d.id, ...data };
      });

      // 3) Preparar batch
      setMensaje("Preparando cargue...");
      const batch = writeBatch(db);

      let totalLeidas = rows.length;
      let totalValidas = 0;
      let totalNuevas = 0;
      let totalActualizadas = 0;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];

        // Encabezados comunes (pueden venir en mayúsculas)
        const aseguradora = pick(r, ["ASEGURADORA", "Aseguradora", "aseguradora"]);
        const poliza = pick(r, ["POLIZA", "PÓLIZA", "Poliza", "Póliza", "poliza"]);

        if (!aseguradora || !poliza) continue;
        totalValidas++;

        const idDoc = makeId(aseguradora, poliza);
        const prev = existentes[idDoc] || null;

        // Campos requeridos por ti
        const data = {
          aseguradora: String(aseguradora).trim(),
          poliza: String(poliza).trim(),

          ramo: String(pick(r, ["RAMO", "Ramo", "ramo"])).trim(),
          placa: String(pick(r, ["PLACA", "Placa", "placa"])).trim(),

          asegurado: String(pick(r, ["ASEGURADO", "Asegurado", "asegurado"])).trim(),
          id_asegurado: String(pick(r, ["ID ASEGURADO", "ID_ASEGURADO", "Id Asegurado", "id_asegurado"])).trim(),

          beneficiario: String(pick(r, ["BENEFICIARIO", "Beneficiario", "beneficiario"])).trim(),
          id_beneficiario: String(pick(r, ["ID BENEFICIARIO", "ID_BENEFICIARIO", "Id Beneficiario", "id_beneficiario"])).trim(),

          tomador: String(pick(r, ["TOMADOR", "Tomador", "tomador"])).trim(),
          id_tomador: String(pick(r, ["ID TOMADOR", "ID_TOMADOR", "Id Tomador", "id_tomador"])).trim(),

          fecha_expedicion: formatYMD(pick(r, ["FECHA EXPEDICION", "FECHA_EXPEDICION", "Fecha expedicion", "Fecha Expedición", "fecha_expedicion"])),
          fecha_inicio: formatYMD(pick(r, ["FECHA INICIO", "FECHA_INICIO", "Fecha inicio", "fecha_inicio"])),
          fecha_fin: formatYMD(pick(r, ["FECHA FIN", "FECHA_FIN", "Fecha fin", "fecha_fin", "FECHA TERMINACION", "FECHA_TERMINACION"])),

          prima: parseNumber(pick(r, ["PRIMA", "Prima", "prima"])),
          gastos_expedicion: parseNumber(pick(r, ["GASTOS EXPEDICION", "GASTOS_EXPEDICION", "Gastos expedicion", "gastos_expedicion"])),
          iva: parseNumber(pick(r, ["IVA", "Iva", "iva"])),
          total: parseNumber(pick(r, ["TOTAL", "Total", "total"])),

          asesor: String(pick(r, ["ASESOR", "Asesor", "asesor"])).trim(),

          // Anulada (puede venir SI/NO o TRUE/FALSE)
          anulada: toSI(pick(r, ["ANULADA", "Anulada", "anulada"])),

          // Campos que en el Excel pueden venir o no, pero tú los quieres:
          renovacion: toSI(pick(r, ["RENOVACION", "RENOVACIÓN", "Renovacion", "Renovación", "renovacion"])),

          comision: parseNumber(pick(r, ["COMISION", "COMISIÓN", "Comision", "Comisión", "comision"])),

          telefono: String(pick(r, ["TELEFONO", "TELÉFONO", "Telefono", "Teléfono", "telefono"])).trim(),
        };

        // 4) Conservar gestión y otros si ya existían
        // (Si el Excel trae vacío, se respeta lo que hay en Firestore)
        const conservados = ["gestion", "renovacion", "comision", "telefono"];
        for (let j = 0; j < conservados.length; j++) {
          const campo = conservados[j];
          const excelVacio =
            data[campo] === "" ||
            data[campo] === null ||
            data[campo] === undefined ||
            (typeof data[campo] === "number" && data[campo] === 0 && campo !== "comision"); // comision 0 puede ser real, lo dejamos

          if (prev && excelVacio && prev[campo] !== undefined) {
            data[campo] = prev[campo];
          }
        }

        // También conservar "gestion" SIEMPRE si existe (aunque Excel no lo traiga)
        if (prev && prev.gestion !== undefined && (data.gestion === undefined || data.gestion === "")) {
          data.gestion = prev.gestion;
        }

        // 5) Upsert
        const ref = doc(db, "polizas", idDoc);
        batch.set(ref, data, { merge: true });

        if (prev) totalActualizadas++;
        else totalNuevas++;
      }

      // 6) Commit batch
      setMensaje("Guardando en Firestore...");
      await batch.commit();

      setMensaje(
        "✅ Listo. Leídas: " +
          totalLeidas +
          " | Válidas: " +
          totalValidas +
          " | Nuevas: " +
          totalNuevas +
          " | Actualizadas: " +
          totalActualizadas
      );

      if (typeof onDone === "function") onDone();
    } catch (err) {
      console.error(err);
      setMensaje("❌ Error: revisa consola (F12).");
    } finally {
      setCargando(false);
      e.target.value = ""; // permitir re-subir el mismo archivo
    }
  };

  return (
    <div className="bg-white border rounded p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-800">Subir Pólizas (Excel)</h3>
      <p className="text-sm text-gray-600 mt-1">
        Importa un Excel y se guarda en Firestore en la colección <b>polizas</b>.
        Conserva <b>gestión / renovación / comisión / teléfono</b> si ya existían.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          disabled={cargando}
        />

        {mensaje ? (
          <div className="text-sm mt-2">
            {mensaje}
          </div>
        ) : null}

        {cargando ? (
          <div className="text-xs text-gray-500">Procesando…</div>
        ) : null}
      </div>
    </div>
  );
}