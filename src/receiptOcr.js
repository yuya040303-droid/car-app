import { createWorker } from "tesseract.js";
import { normalizeCityName } from "./cityNames.js";

const toHalfWidth = (str) => str.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

const AMOUNT_KEYWORDS = ["合計", "合計金額", "ご請求", "お会計", "現計", "総額", "小計", "計", "total", "Total", "TOTAL", "¥", "円", "\\"];

function scoreAmountCandidate(text, index, matchLength) {
  const context = text.slice(Math.max(0, index - 8), Math.min(text.length, index + matchLength + 8));
  let score = 0;
  for (const kw of AMOUNT_KEYWORDS) if (context.includes(kw)) score += 5;
  return score;
}

/**
 * OCRで取得した領収書のテキストから、金額・日付・店舗名らしき情報を
 * ヒューリスティックに抽出する。あくまで候補であり、利用者による
 * 確認・修正を前提とする。
 */
export function parseReceiptText(rawText) {
  const text = toHalfWidth(rawText || "");

  const numberRe = /[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,7}/g;
  let match;
  let best = null;
  while ((match = numberRe.exec(text))) {
    const raw = match[0];
    const value = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0 || value > 5000000) continue;
    const score = scoreAmountCandidate(text, match.index, raw.length) + Math.log10(value);
    if (!best || score > best.score) best = { score, value };
  }
  const amount = best ? best.value : null;

  let date = null;
  const ymd = text.match(/(20\d{2})[/\-年.](\d{1,2})[/\-月.](\d{1,2})/);
  const reiwa = text.match(/令和\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  const md = text.match(/(?<!\d)(\d{1,2})[/\-](\d{1,2})(?!\d)/);
  if (ymd) {
    date = `${ymd[1]}-${String(ymd[2]).padStart(2, "0")}-${String(ymd[3]).padStart(2, "0")}`;
  } else if (reiwa) {
    const year = 2018 + Number(reiwa[1]);
    date = `${year}-${String(reiwa[2]).padStart(2, "0")}-${String(reiwa[3]).padStart(2, "0")}`;
  } else if (md) {
    date = `${new Date().getFullYear()}-${String(md[1]).padStart(2, "0")}-${String(md[2]).padStart(2, "0")}`;
  }

  const memo =
    text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length >= 2 && /[^\d\s.,:\-/¥円]/.test(l)) || "";

  return { amount, date, memo, rawText: text };
}

const DEPARTURE_KEYWORDS = ["出発", "Departure", "Dep.", "Dep ", "DEP"];
const ARRIVAL_KEYWORDS = ["到着", "Arrival", "Arr.", "Arr ", "ARR"];
const HOME_CITY_PATTERNS = [/上海/, /shanghai/i, /\bPVG\b/, /\bSHA\b/];

/**
 * フライト画面のテキストから「上海⇄行先」の区間表記を探し、上海側ではない
 * 方の都市名を行先候補として返す。見つからなければ null。
 */
function extractDestinationCity(text) {
  const routeRe = /([一-鿿ァ-ヶー]{2,10}|[A-Za-z]{2,20})\s*(?:\([A-Za-z]{3}\))?\s*(?:→|->|-|~|⇄)\s*([一-鿿ァ-ヶー]{2,10}|[A-Za-z]{2,20})\s*(?:\([A-Za-z]{3}\))?/g;
  let m;
  while ((m = routeRe.exec(text))) {
    const [, a, b] = m;
    const aIsHome = HOME_CITY_PATTERNS.some((p) => p.test(a));
    const bIsHome = HOME_CITY_PATTERNS.some((p) => p.test(b));
    if (aIsHome && !bIsHome) return b;
    if (bIsHome && !aIsHome) return a;
  }
  return null;
}

/**
 * フライト画面（予約確認画面等）のOCRテキストから、出発時刻・到着時刻の
 * 候補をヒューリスティックに抽出する。時刻表記（HH:MM）のうち、
 * 「出発/到着」等のキーワードに近いものを採用する。見つからない場合は
 * 最初と2番目の時刻を出発/到着として仮定する。あくまで候補であり、
 * 利用者による確認・修正を前提とする。
 */
export function parseFlightText(rawText) {
  const text = toHalfWidth(rawText || "");
  const timeRe = /([01]?\d|2[0-3]):([0-5]\d)/g;
  const times = [];
  let m;
  while ((m = timeRe.exec(text))) {
    times.push({ index: m.index, value: `${m[1].padStart(2, "0")}:${m[2]}` });
  }

  const findNear = (keywords) => {
    let best = null;
    let bestDist = Infinity;
    for (const kw of keywords) {
      let searchFrom = 0;
      let idx;
      while ((idx = text.indexOf(kw, searchFrom)) !== -1) {
        for (const t of times) {
          const dist = Math.abs(t.index - idx);
          if (dist < bestDist) {
            bestDist = dist;
            best = t;
          }
        }
        searchFrom = idx + kw.length;
      }
    }
    return bestDist < 40 ? best : null;
  };

  const depMatch = findNear(DEPARTURE_KEYWORDS);
  const arrMatch = findNear(ARRIVAL_KEYWORDS);
  const departureTime = depMatch?.value || times[0]?.value || null;
  const arrivalTime = arrMatch && arrMatch !== depMatch ? arrMatch.value : times.find((t) => t.value !== departureTime)?.value || null;
  const destinationCityRaw = extractDestinationCity(text);
  const destinationCity = destinationCityRaw ? normalizeCityName(destinationCityRaw) : null;

  return { departureTime, arrivalTime, destinationCity, rawText: text };
}

/**
 * フライト画面のOCRテキストから便名候補を抽出する。コードシェア表記
 * （例：MU8631（FM815））の場合は、括弧内の併記番号を除いた主便名を
 * 優先して1件だけ返す。
 */
export function parseFlightNumberText(rawText) {
  const text = toHalfWidth(rawText || "").toUpperCase();
  const flightRe = /\b([A-Z]{2,3}\d{2,4}|[A-Z0-9]{2}\d{2,4})\b/g;
  const candidates = [];
  let m;
  while ((m = flightRe.exec(text))) {
    const before = text.slice(0, m.index);
    const openCount = (before.match(/\(/g) || []).length;
    const closeCount = (before.match(/\)/g) || []).length;
    candidates.push({ value: m[1], insideParens: openCount > closeCount });
  }
  const primary = candidates.find((c) => !c.insideParens) || candidates[0] || null;
  return { flightNumber: primary ? primary.value : null, candidates: candidates.map((c) => c.value), rawText: text };
}

/**
 * ホテル予約画面のOCRテキストから、ホテル名候補・チェックイン/チェック
 * アウト日候補・電話番号候補を抽出する。電話番号はスクショに載っていない
 * ことが多いため、見つからなければ null（手動入力・公式サイト等での
 * 確認を前提とする）。
 */
export function parseHotelText(rawText) {
  const text = toHalfWidth(rawText || "");

  const dateMatches = [];
  const ymdRe = /(20\d{2})[/\-年.](\d{1,2})[/\-月.](\d{1,2})/g;
  let m;
  while ((m = ymdRe.exec(text))) {
    dateMatches.push(`${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`);
  }
  if (dateMatches.length < 2) {
    const mdRe = /(?<!\d)(\d{1,2})[/\-](\d{1,2})(?!\d)/g;
    const year = new Date().getFullYear();
    let mm;
    while ((mm = mdRe.exec(text))) {
      dateMatches.push(`${year}-${String(mm[1]).padStart(2, "0")}-${String(mm[2]).padStart(2, "0")}`);
    }
  }
  const uniqDates = [...new Set(dateMatches)].sort();
  const checkIn = uniqDates[0] || null;
  const checkOut = uniqDates[1] || null;

  const phoneMatch = text.match(/0\d{1,4}-\d{1,4}-\d{3,4}/);
  const phone = phoneMatch ? phoneMatch[0] : null;

  const hotelName =
    text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length >= 3 && /[^\d\s.,:\-/]/.test(l)) || "";

  return { hotelName, checkIn, checkOut, phone, rawText: text };
}

async function runOcr(file, onProgress) {
  const worker = await createWorker("jpn+eng", 1, {
    workerPath: "/worker.min.js",
    corePath: "/tesseract-core/",
    langPath: "/tessdata/",
    logger: (m) => {
      if (onProgress && m.status === "recognizing text") onProgress(Math.round((m.progress || 0) * 100));
    },
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(file);
    return text;
  } finally {
    await worker.terminate();
  }
}

/**
 * 領収書画像をOCRし、金額・日付・店舗名の候補を返す。
 * onProgress(0-100) で読み取り進捗を通知する。
 */
export async function recognizeReceipt(file, onProgress) {
  const text = await runOcr(file, onProgress);
  return parseReceiptText(text);
}

/**
 * フライト画面（予約確認画面）の画像をOCRし、出発・到着時刻の候補を返す。
 * onProgress(0-100) で読み取り進捗を通知する。
 */
export async function recognizeFlight(file, onProgress) {
  const text = await runOcr(file, onProgress);
  return parseFlightText(text);
}

/**
 * フライト画面の画像をOCRし、便名候補を返す。
 * onProgress(0-100) で読み取り進捗を通知する。
 */
export async function recognizeFlightNumber(file, onProgress) {
  const text = await runOcr(file, onProgress);
  return parseFlightNumberText(text);
}

/**
 * ホテル予約画面の画像をOCRし、ホテル名・チェックイン/アウト日・
 * 電話番号の候補を返す。onProgress(0-100) で読み取り進捗を通知する。
 */
export async function recognizeHotel(file, onProgress) {
  const text = await runOcr(file, onProgress);
  return parseHotelText(text);
}

/**
 * IC明細等、構造化パーサーを持たない画像をOCRし、認識結果のテキストを
 * そのまま返す。呼び出し側で貼り付け欄に反映し、利用者が整形する想定。
 */
export async function recognizeRawText(file, onProgress) {
  const text = await runOcr(file, onProgress);
  return { rawText: text };
}
