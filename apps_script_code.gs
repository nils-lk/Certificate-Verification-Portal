/**
 * ============================================================
 *  NILS Certificate Verification API
 *  Google Apps Script – Code.gs
 * ============================================================
 *
 *  Endpoints:
 *  ─────────────────────────────────────────────────────────
 *  GET ?q=<CertNumber>          → Search all registry sheets
 *  GET ?action=years            → List available registry years
 *  GET ?q=<CertNumber>&year=2025 → Search a specific year only
 *  ─────────────────────────────────────────────────────────
 *
 *  Sheet naming convention:
 *    Each year's data must be on a sheet named exactly:
 *    "Certificate Registry 2024", "Certificate Registry 2025", etc.
 *
 *  Column headers expected (row 1 of each sheet):
 *    Certificate No | Name with initial | Programme Name |
 *    Date | Working Place | Serial No | Date of Printing
 * ============================================================
 */

// ── Constants ──────────────────────────────────────────────
const SHEET_NAME_PREFIX = 'Certificate Registry ';
const SEARCH_COLUMN     = 'Certificate No';   // column used for ?q= lookup

// ══════════════════════════════════════════════════════════════
//  doGet – entry point
// ══════════════════════════════════════════════════════════════
function doGet(e) {
  try {
    const params = e.parameter || {};
    const action = (params.action || '').toLowerCase().trim();

    // ── Route: ?action=years ─────────────────────────────────
    if (action === 'years') {
      return jsonResponse(getAvailableYears());
    }

    // ── Route: ?q=CertNumber ─────────────────────────────────
    const query = (params.q || '').trim();
    if (!query) {
      return jsonResponse({ status: 'error', message: 'Please provide ?q=CertNo' });
    }

    const yearFilter = (params.year || '').trim();  // optional
    const results    = searchAllSheets(query, yearFilter);
    return jsonResponse(results);

  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

// ══════════════════════════════════════════════════════════════
//  getAvailableYears
//  Returns: { years: [2025, 2024, ...] }  (newest first)
// ══════════════════════════════════════════════════════════════
function getAvailableYears() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const sheets  = ss.getSheets();
  const years   = [];

  sheets.forEach(function(sheet) {
    const name = sheet.getName();
    if (name.startsWith(SHEET_NAME_PREFIX)) {
      const yearStr = name.replace(SHEET_NAME_PREFIX, '').trim();
      const year    = parseInt(yearStr, 10);
      if (!isNaN(year) && year > 1900 && year < 2200) {
        years.push(year);
      }
    }
  });

  // Sort newest first
  years.sort(function(a, b) { return b - a; });
  return { years: years };
}

// ══════════════════════════════════════════════════════════════
//  searchAllSheets
//  Searches every "Certificate Registry YYYY" sheet (or just
//  the one matching yearFilter if provided).
//  Returns: array of matching record objects (usually 0 or 1)
// ══════════════════════════════════════════════════════════════
function searchAllSheets(query, yearFilter) {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const sheets  = ss.getSheets();
  const results = [];
  const queryLC = query.toLowerCase();

  sheets.forEach(function(sheet) {
    const name = sheet.getName();

    // Only process "Certificate Registry YYYY" sheets
    if (!name.startsWith(SHEET_NAME_PREFIX)) return;

    // If a year filter was supplied, skip non-matching sheets
    if (yearFilter) {
      const sheetYear = name.replace(SHEET_NAME_PREFIX, '').trim();
      if (sheetYear !== yearFilter) return;
    }

    // Read all data including headers
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return;   // empty sheet

    const headers    = data[0];
    const searchCol  = headers.indexOf(SEARCH_COLUMN);
    if (searchCol === -1) return;  // sheet doesn't have the expected column

    // Extract the year once for every matching record
    const sheetYear = name.replace(SHEET_NAME_PREFIX, '').trim();

    // Scan rows (skip header row 0)
    for (var i = 1; i < data.length; i++) {
      const row     = data[i];
      const cellVal = String(row[searchCol] || '').trim();

      if (cellVal.toLowerCase() === queryLC) {
        // Build a plain object using the header names as keys
        var record = {};
        headers.forEach(function(header, idx) {
          record[String(header)] = row[idx] !== undefined ? row[idx] : '';
        });

        // Attach metadata so the front-end can show the year badge
        record['SourceSheet'] = name;
        record['RegistryYear'] = sheetYear;

        results.push(record);
      }
    }
  });

  return results;
}

// ══════════════════════════════════════════════════════════════
//  jsonResponse – CORS-safe JSON output
// ══════════════════════════════════════════════════════════════
function jsonResponse(data) {
  var payload = JSON.stringify(data);
  var output  = ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}
