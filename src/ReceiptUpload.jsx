import { useRef, useState } from "react";
import { recognizeReceipt } from "./receiptOcr.js";

/**
 * 画像OCRの共通アップロードボタン。デフォルトは領収書用（金額・日付抽出）。
 * `recognize` / `describeResult` を差し替えるとフライト画面の時刻抽出などにも使える。
 */
export default function ReceiptUpload({
  label = "📷 領収書を読み取る",
  onExtracted,
  showToast,
  recognize = recognizeReceipt,
  describeResult = (r) => (r.amount ? `金額候補：¥${r.amount.toLocaleString()}` : null),
}) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLoading(true);
    setProgress(0);
    try {
      const result = await recognize(file, setProgress);
      onExtracted(result);
      const desc = describeResult(result);
      if (desc) {
        showToast?.(`読み取りました（${desc}）。内容をご確認ください`, "info");
      } else {
        showToast?.("読み取りましたが自動認識できませんでした。手動で入力してください", "error");
      }
    } catch (err) {
      showToast?.("画像の読み取りに失敗しました", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFile} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        style={{
          fontSize: 11,
          background: "#FFFAF0",
          color: "#B7791F",
          border: "1px solid #F6E05E",
          borderRadius: 8,
          padding: "6px 10px",
          cursor: loading ? "default" : "pointer",
          width: "100%",
        }}
      >
        {loading ? `読み取り中... ${progress}%` : label}
      </button>
    </>
  );
}
