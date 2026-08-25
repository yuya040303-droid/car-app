import ExcelJS from "exceljs";

const TEMPLATE_URL = "/templates/travel_application_template.xlsx";
const SHEET_NAME = "2月4日";

export const HOTEL_ROW_CAPACITY = 7; // rows 25-31

const clearCell = (ws, ref) => {
  ws.getCell(ref).value = null;
};

const clearRange = (ws, startRow, endRow, cols) => {
  for (let r = startRow; r <= endRow; r++) {
    for (const c of cols) clearCell(ws, `${c}${r}`);
  }
};

const fmtJpDate = (isoDate) => {
  const d = new Date(isoDate + "T00:00:00");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

const fmtMonthDay = (isoDate) => {
  const d = new Date(isoDate + "T00:00:00");
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

/**
 * data shape:
 * {
 *   name, passportNo, employeeId, email, overseasMobile, emergencyContact,
 *   country, outboundFlight, transitFlight, returnFlight,
 *   departureDate, returnDate, // ISO "YYYY-MM-DD"
 *   submittedDate, // ISO "YYYY-MM-DD"（省略時は当日）
 *   stays: [{ city, checkIn, checkOut, hotelName, tel, fax, address }],
 * }
 */
export async function generateTravelApplicationExcel(data) {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error("テンプレートの読み込みに失敗しました");
  const buffer = await res.arrayBuffer();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.getWorksheet(SHEET_NAME);
  if (!ws) throw new Error("テンプレートの形式が想定と異なります");

  const submittedDate = data.submittedDate || new Date().toISOString().split("T")[0];
  ws.getCell("I5").value = `提交日期：　${fmtJpDate(submittedDate)}`;
  ws.getCell("B9").value = `姓名：　　　　　　${data.name || ""}`;
  ws.getCell("F9").value = `护照号码：              ${data.passportNo || ""}`;
  ws.getCell("B11").value = `出差地点（国名）：${data.country || ""}`;
  ws.getCell("F11").value = `去程航班名称：${data.outboundFlight || ""}`;
  ws.getCell("I11").value = `中转航班名称：${data.transitFlight || ""}`;
  ws.getCell("F12").value = `回程航班名称: ${data.returnFlight || ""}`;
  if (data.departureDate && data.returnDate) {
    ws.getCell("B14").value = `出差日期：　　　${fmtMonthDay(data.departureDate)}（出发），　　${fmtMonthDay(data.returnDate)}（回国）`;
  } else {
    ws.getCell("B14").value = "出差日期：";
  }
  ws.getCell("D16").value = `海外手机号码：　　${data.overseasMobile || ""}`;
  ws.getCell("D17").value = `E-Mail:　　${data.email || ""}`;
  ws.getCell("B20").value = `国内紧急联络人【亲属】： ${data.emergencyContact || ""}`;

  clearRange(ws, 25, 24 + HOTEL_ROW_CAPACITY, ["B", "C", "D", "E", "G", "H", "I"]);
  const stays = (data.stays || []).slice(0, HOTEL_ROW_CAPACITY);
  stays.forEach((s, i) => {
    const row = 25 + i;
    ws.getCell(`B${row}`).value = s.city || "";
    if (s.checkIn) {
      const cell = ws.getCell(`C${row}`);
      cell.value = new Date(s.checkIn);
      cell.numFmt = 'm"月"d"日"';
    }
    if (s.checkOut) {
      const cell = ws.getCell(`D${row}`);
      cell.value = new Date(s.checkOut);
      cell.numFmt = 'm"月"d"日"';
    }
    ws.getCell(`E${row}`).value = s.hotelName || "";
    ws.getCell(`G${row}`).value = s.tel || "";
    ws.getCell(`H${row}`).value = s.fax || "";
    ws.getCell(`I${row}`).value = s.address || "";
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
