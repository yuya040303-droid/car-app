import { createWorker } from "tesseract.js";

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

/**
 * 画像ファイルをOCRし、金額・日付・店舗名の候補を返す。
 * onProgress(0-100) で読み取り進捗を通知する。
 */
export async function recognizeReceipt(file, onProgress) {
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
    return parseReceiptText(text);
  } finally {
    await worker.terminate();
  }
}
