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
