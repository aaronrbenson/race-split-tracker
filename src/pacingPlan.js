import { AID_STATIONS_KM } from './data.js';

const DEFAULT_CSV_URL = '/rocky_100k_pacing_plan.csv';

/** One loop in miles from the aid station chart (Tyler's to Tyler's). */
const LOOP_MILES = 22.2;

/**
 * Parse CSV text into array of row objects (first row = headers).
 * Handles quoted fields and simple comma separation.
 */
function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Derive crewAccess from station name / notes.
 * Crew can meet at Tyler's and at Nature Center (Zach pickup).
 */
function isCrewAccess(station, notes) {
  const s = (station || '').toLowerCase();
  const n = (notes || '').toLowerCase();
  return s.includes("tyler's") || s.includes('tylers') || s.includes('finish') || n.includes('crew') || n.includes('zach');
}

/**
 * Parse CSV row into AID_STATIONS_KM format.
 */
function rowToAidStation(row) {
  const km = parseFloat(row.km);
  const mile = parseFloat(row.mile);
  const name = (row.station || '').trim();
  return {
    name,
    km: Number.isNaN(km) ? 0 : km,
    mile: Number.isNaN(mile) ? undefined : mile,
    target: (row.target_time || '—').trim() || '—',
    early: (row.early_time || '—').trim() || '—',
    late: (row.late_time || '—').trim() || '—',
    cutoff: '—',
    crewAccess: isCrewAccess(row.station, row.notes),
  };
}

/**
 * Derive first-lap aid stations for map markers (Gate, Nature Center, Dam Nation).
 * Uses first occurrence of each non-Tyler's station in Lap 1 or Prologue.
 */
function deriveFirstLapAidKm(aidStations) {
  const seen = new Set();
  const result = [];
  for (const s of aidStations) {
    const base = s.name.replace(/\s*\([^)]*\)\s*$/, '').trim(); // "Nature Center (Zach)" -> "Nature Center"
    if (base.includes("Tyler's") || base === 'FINISH' || base === 'Start') continue;
    if (seen.has(base)) continue;
    seen.add(base);
    result.push({
      name: base,
      mile: s.mile != null ? s.mile : s.km / 1.60934,
    });
  }
  return result;
}

/**
 * Fetch and parse pacing plan CSV. Returns { aidStations, firstLapAidKm }.
 * Falls back to built-in AID_STATIONS_KM on fetch/parse failure.
 */
export async function loadPacingPlan(csvUrl = DEFAULT_CSV_URL) {
  try {
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    if (rows.length === 0) throw new Error('Empty CSV');
    const aidStations = rows.map(rowToAidStation).filter((s) => s.name);
    if (aidStations.length === 0) throw new Error('No valid stations');
    const firstLapAidKm = deriveFirstLapAidKm(aidStations);
    return { aidStations, firstLapAidKm };
  } catch (err) {
    console.warn('Pacing plan: could not load CSV, using built-in:', err?.message || err);
    const firstLapAidKm = [
      { name: 'Gate', mile: 6 },
      { name: 'Nature Center', mile: 11.3 },
      { name: 'Dam Nation', mile: 16.3 },
    ];
    return { aidStations: AID_STATIONS_KM, firstLapAidKm };
  }
}
