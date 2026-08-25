import ExcelJS from "exceljs";

const TEMPLATE_URL = "/templates/travel_expense_template.xlsx";
const OVERSEAS_SHEET = "国外差旅费报销单";
const DETAIL_SHEET = "明細";

export const OVERSEAS_ROW_CAPACITY = 16; // rows 10-25
export const DOMESTIC_ROW_CAPACITY = 2; // rows 30-31
export const LEG_ROW_CAPACITY = 7; // rows 3-9 (明細)
export const HOTEL_ROW_CAPACITY = 2; // rows 14-15 (明細)

const num = (v) => {
  const n = Number(v);
  return v === "" || v === null || v === undefined || Number.isNaN(n) ? null : n;
};

const clearCell = (ws, ref) => {
  ws.getCell(ref).value = null;
};

const clearRange = (ws, startRow, endRow, cols) => {
  for (let r = startRow; r <= endRow; r++) {
    for (const c of cols) clearCell(ws, `${c}${r}`);
  }
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const numericValue = (v) => (typeof v === "number" ? v : 0);

const sumCol = (ws, col, r1, r2) => {
  let s = 0;
  for (let r = r1; r <= r2; r++) s += numericValue(ws.getCell(`${col}${r}`).value);
  return s;
};

/**
 * ExcelJSはテンプレートの数式をそのまま保持するが、計算済みの
 * キャッシュ値までは書き込まない。Excelが自動再計算しないビューア
 * （一部のモバイルアプリ等）で開くと空欄に見えてしまうため、数式は
 * 維持しつつ、こちらで計算した結果もキャッシュとして明示的に書き込む。
 */
const setFormulaWithCache = (ws, ref, formula, result) => {
  ws.getCell(ref).value = { formula, result };
};

/**
 * data shape:
 * {
 *   name, department,
 *   fxRates: { USD, JPY, EUR, TWD },
 *   days: [{ date, city, allowance, lodging, routeText, transportAmount, remark }],
 *   domesticDays: [{ date, location, method, amount }],
 *   legs: [{ date, from, to, amount, method, memo }],
 *   hotels: [{ period, hotelName, amount }],
 * }
 */
export async function generateTravelExpenseExcel(data) {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error("テンプレートの読み込みに失敗しました");
  const buffer = await res.arrayBuffer();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.getWorksheet(OVERSEAS_SHEET);
  const wsDetail = workbook.getWorksheet(DETAIL_SHEET);
  if (!ws || !wsDetail) throw new Error("テンプレートの形式が想定と異なります");

  if (data.name) {
    ws.name = `国外差旅费报销　${data.name}`;
    wsDetail.getCell("A1").value = data.name;
  }

  ws.getCell("H3").value = data.department || "";
  ws.getCell("H5").value = data.name || "";
  ws.getCell("D3").value = num(data.fxRates?.USD);
  ws.getCell("D4").value = num(data.fxRates?.JPY);
  ws.getCell("D5").value = num(data.fxRates?.EUR);
  ws.getCell("D6").value = num(data.fxRates?.TWD);

  // --- 海外（日本）出張：日別明細 rows 10-25 ---
  clearRange(ws, 10, 9 + OVERSEAS_ROW_CAPACITY, ["B", "C", "D", "E", "F", "G", "I"]);
  const days = (data.days || []).slice(0, OVERSEAS_ROW_CAPACITY);
  days.forEach((day, i) => {
    const row = 10 + i;
    if (day.date) ws.getCell(`B${row}`).value = new Date(day.date);
    ws.getCell(`C${row}`).value = day.city || "";
    ws.getCell(`D${row}`).value = num(day.allowance);
    ws.getCell(`E${row}`).value = num(day.lodging);
    ws.getCell(`F${row}`).value = day.routeText || "";
    ws.getCell(`G${row}`).value = num(day.transportAmount);
    // 備考（I列）はExcelへ自動反映しない（利用者の指示）。範囲クリア済みのため空欄のまま。
  });

  // --- 国内（中国国内）出張 rows 30-31 ---
  clearRange(ws, 30, 29 + DOMESTIC_ROW_CAPACITY, ["B", "C", "D", "E"]);
  const domesticDays = (data.domesticDays || []).slice(0, DOMESTIC_ROW_CAPACITY);
  domesticDays.forEach((d, i) => {
    const row = 30 + i;
    if (d.date) ws.getCell(`B${row}`).value = new Date(d.date);
    ws.getCell(`C${row}`).value = d.location || "";
    ws.getCell(`D${row}`).value = d.method || "";
    ws.getCell(`E${row}`).value = num(d.amount);
  });

  // --- 明細シート：交通費内訳 rows 3-9 ---
  clearRange(wsDetail, 3, 2 + LEG_ROW_CAPACITY, ["A", "B", "C", "D", "E", "F"]);
  const legs = (data.legs || []).slice(0, LEG_ROW_CAPACITY);
  legs.forEach((leg, i) => {
    const row = 3 + i;
    if (leg.date) wsDetail.getCell(`A${row}`).value = new Date(leg.date);
    wsDetail.getCell(`B${row}`).value = leg.from || "";
    wsDetail.getCell(`C${row}`).value = leg.to || "";
    wsDetail.getCell(`D${row}`).value = num(leg.amount);
    wsDetail.getCell(`E${row}`).value = leg.method || "";
    wsDetail.getCell(`F${row}`).value = leg.memo || "";
  });

  // --- 明細シート：宿泊内訳 rows 14-15 ---
  clearRange(wsDetail, 14, 13 + HOTEL_ROW_CAPACITY, ["A", "B", "D"]);
  const hotels = (data.hotels || []).slice(0, HOTEL_ROW_CAPACITY);
  hotels.forEach((h, i) => {
    const row = 14 + i;
    wsDetail.getCell(`A${row}`).value = h.period || "";
    wsDetail.getCell(`B${row}`).value = h.hotelName || "";
    wsDetail.getCell(`D${row}`).value = num(h.amount);
  });

  // --- 集計セルの再計算キャッシュを書き込む（数式は維持） ---
  for (let r = 10; r <= 25; r++) {
    const rowTotal = numericValue(ws.getCell(`E${r}`).value) + numericValue(ws.getCell(`G${r}`).value);
    setFormulaWithCache(ws, `H${r}`, `SUM(E${r}:G${r})`, rowTotal);
  }
  const D26v = sumCol(ws, "D", 10, 25);
  const E26v = sumCol(ws, "E", 10, 25);
  const G26v = sumCol(ws, "G", 10, 25);
  const H26v = sumCol(ws, "H", 10, 25);
  setFormulaWithCache(ws, "D26", "SUM(D10:D25)", D26v);
  setFormulaWithCache(ws, "E26", "SUM(E10:E25)", E26v);
  setFormulaWithCache(ws, "G26", "SUM(G10:G25)", G26v);
  setFormulaWithCache(ws, "H26", "SUM(H10:H25)", H26v);

  const rateJPY = num(data.fxRates?.JPY) || 0;
  const D27v = round2(D26v * rateJPY);
  const E27v = round2(E26v * rateJPY);
  const G27v = round2(G26v * rateJPY);
  const I27v = round2(D27v + G27v + E27v);
  setFormulaWithCache(ws, "D27", "ROUND(D26*D4,2)", D27v);
  setFormulaWithCache(ws, "E27", "ROUND(E26*D4,2)", E27v);
  setFormulaWithCache(ws, "G27", "ROUND(G26*D4,2)", G27v);
  setFormulaWithCache(ws, "I27", "D27+G27+E27", I27v);

  const E30v = numericValue(ws.getCell("E30").value);
  const E31v = numericValue(ws.getCell("E31").value);
  const H30v = round2(E30v + E31v);
  const H29v = I27v;
  const H31v = round2(H29v + H30v);
  setFormulaWithCache(ws, "H29", "I27", H29v);
  setFormulaWithCache(ws, "H30", "E30+E31", H30v);
  setFormulaWithCache(ws, "H31", "H29+H30", H31v);

  const legTotal = sumCol(wsDetail, "D", 3, 9);
  setFormulaWithCache(wsDetail, "G10", "SUM(D3:D9)", legTotal);
  const hotelTotal = sumCol(wsDetail, "D", 14, 15);
  setFormulaWithCache(wsDetail, "D16", "SUM(D14:D15)", hotelTotal);

  workbook.calcProperties.fullCalcOnLoad = true;

  return workbook.xlsx.writeBuffer();
}

export function downloadExcelBuffer(buffer, filename) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
