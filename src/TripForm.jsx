import { useState } from "react";
import { cardStyle, labelStyle, inputStyle, primaryBtn, ghostBtn } from "./styles.js";
import ReceiptUpload from "./ReceiptUpload.jsx";
import { recognizeFlight } from "./receiptOcr.js";
import { calcJapanDailyAllowances, calcKoreaDailyAllowances } from "./perDiemRules.js";
import {
  generateTravelExpenseExcel,
  downloadExcelBuffer,
  OVERSEAS_ROW_CAPACITY,
  DOMESTIC_ROW_CAPACITY,
  LEG_ROW_CAPACITY,
  HOTEL_ROW_CAPACITY,
} from "./excelTemplate.js";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtYen = (n) => `¥${Number(n || 0).toLocaleString()}`;
const fmtCny = (n) => `CN¥${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptyDay = () => ({ date: todayStr(), city: "", allowance: "", lodging: "", routeText: "", transportAmount: "", remark: "" });
const emptyDomestic = () => ({ date: todayStr(), location: "", method: "", amount: "" });
const emptyLeg = () => ({ date: todayStr(), from: "", to: "", amount: "", method: "", memo: "" });
const emptyHotel = () => ({ period: "", hotelName: "", amount: "" });
const emptyFlightSettings = () => ({
  country: "japan",
  rank: "general",
  startDate: todayStr(),
  endDate: todayStr(),
  departureTime: "",
  arrivalTime: "",
  defaultCity: "",
  excludeWeekend: false,
});

const normalizeDate = (raw) => {
  const s = String(raw || "").trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${new Date().getFullYear()}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return s;
};

const smallBtn = { background: "#1A2980", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer", flexShrink: 0 };
const miniInput = { ...inputStyle, background: "#fff", fontSize: 13, padding: "8px 10px" };
const rowGrid = { display: "grid", gridTemplateColumns: "1fr", gap: 6, marginBottom: 8 };
const sectionTitle = { fontWeight: 700, fontSize: 14, color: "#2D3748", marginBottom: 4 };
const helpText = { fontSize: 11, color: "#A0AEC0", marginBottom: 10 };

function EntryList({ entries, onRemove, render }) {
  if (entries.length === 0) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      {entries.map((e) => (
        <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #EDF2F7" }}>
          <div style={{ fontSize: 12, color: "#2D3748", lineHeight: 1.6 }}>{render(e)}</div>
          <button onClick={() => onRemove(e.id)} style={{ background: "none", border: "none", color: "#C53030", fontSize: 16, cursor: "pointer", flexShrink: 0, marginLeft: 8 }}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * 出張の記録フォーム。日別明細の入力から、そのまま提出用Excel
 * （旅費精算書）を生成できる。記録の保存とExcel生成は別アクション
 * だが、同じ入力を使い回すため二重入力にはならない。
 */
export default function TripForm({ initial, profile, perDiemRate, onSave, onCancel, showToast }) {
  const [purpose, setPurpose] = useState(initial?.purpose || "");
  const [header, setHeader] = useState(
    initial?.header || { name: profile.name, department: profile.dept, rateUSD: "", rateJPY: "", rateEUR: "", rateTWD: "" }
  );
  const [days, setDays] = useState(initial?.days || []);
  const [dayDraft, setDayDraft] = useState(emptyDay());
  const [domesticDays, setDomesticDays] = useState(initial?.domesticDays || []);
  const [domesticDraft, setDomesticDraft] = useState(emptyDomestic());
  const [showDetail, setShowDetail] = useState(false);
  const [legs, setLegs] = useState(initial?.legs || []);
  const [legDraft, setLegDraft] = useState(emptyLeg());
  const [hotels, setHotels] = useState(initial?.hotels || []);
  const [hotelDraft, setHotelDraft] = useState(emptyHotel());
  const [generating, setGenerating] = useState(false);
  const [flightSettings, setFlightSettings] = useState(emptyFlightSettings());
  const [koreaPreview, setKoreaPreview] = useState(null);
  const [icText, setIcText] = useState("");

  const addDay = () => {
    if (!dayDraft.date || !dayDraft.city.trim()) {
      showToast("日付と城市（訪問地）を入力してください", "error");
      return;
    }
    if (days.length >= OVERSEAS_ROW_CAPACITY) {
      showToast(`日別明細は最大${OVERSEAS_ROW_CAPACITY}行までです`, "error");
      return;
    }
    setDays((d) => [...d, { id: uid(), ...dayDraft }].sort((a, b) => a.date.localeCompare(b.date)));
    setDayDraft(emptyDay());
  };
  const removeDay = (id) => setDays((d) => d.filter((x) => x.id !== id));

  const addDomestic = () => {
    if (!domesticDraft.location.trim()) {
      showToast("移動地点を入力してください", "error");
      return;
    }
    if (domesticDays.length >= DOMESTIC_ROW_CAPACITY) {
      showToast(`国内（中国）出張は最大${DOMESTIC_ROW_CAPACITY}行までです`, "error");
      return;
    }
    setDomesticDays((d) => [...d, { id: uid(), ...domesticDraft }]);
    setDomesticDraft(emptyDomestic());
  };
  const removeDomestic = (id) => setDomesticDays((d) => d.filter((x) => x.id !== id));

  const addLeg = () => {
    if (!legDraft.from.trim() || !legDraft.to.trim()) {
      showToast("出発地・到着地を入力してください", "error");
      return;
    }
    if (legs.length >= LEG_ROW_CAPACITY) {
      showToast(`交通費内訳は最大${LEG_ROW_CAPACITY}行までです`, "error");
      return;
    }
    setLegs((l) => [...l, { id: uid(), ...legDraft }]);
    setLegDraft(emptyLeg());
  };
  const removeLeg = (id) => setLegs((l) => l.filter((x) => x.id !== id));

  const addHotel = () => {
    if (!hotelDraft.hotelName.trim()) {
      showToast("ホテル名を入力してください", "error");
      return;
    }
    if (hotels.length >= HOTEL_ROW_CAPACITY) {
      showToast(`宿泊内訳は最大${HOTEL_ROW_CAPACITY}行までです`, "error");
      return;
    }
    setHotels((h) => [...h, { id: uid(), ...hotelDraft }]);
    setHotelDraft(emptyHotel());
  };
  const removeHotel = (id) => setHotels((h) => h.filter((x) => x.id !== id));

  const applyAutoAllowance = () => {
    if (!flightSettings.startDate || !flightSettings.endDate) {
      showToast("出張期間（開始日・終了日）を入力してください", "error");
      return;
    }
    if (flightSettings.startDate > flightSettings.endDate) {
      showToast("終了日は開始日以降にしてください", "error");
      return;
    }
    if (flightSettings.country === "korea") {
      const calc = calcKoreaDailyAllowances({
        startDate: flightSettings.startDate,
        endDate: flightSettings.endDate,
        excludeWeekend: flightSettings.excludeWeekend,
        rank: flightSettings.rank,
      });
      setKoreaPreview(calc);
      showToast("韓国出張の手当（USD建て）を参考値として計算しました。日別明細（円建て）への自動反映はできません");
      return;
    }
    setKoreaPreview(null);
    const calc = calcJapanDailyAllowances({
      startDate: flightSettings.startDate,
      endDate: flightSettings.endDate,
      departureTime: flightSettings.departureTime,
      arrivalTime: flightSettings.arrivalTime,
      excludeWeekend: flightSettings.excludeWeekend,
      rank: flightSettings.rank,
    });
    setDays((prev) => {
      const map = new Map(prev.map((d) => [d.date, d]));
      for (const c of calc) {
        const existing = map.get(c.date);
        if (existing) {
          map.set(c.date, { ...existing, allowance: c.amount, city: existing.city || flightSettings.defaultCity, remark: existing.remark || c.note });
        } else {
          map.set(c.date, { id: uid(), date: c.date, city: flightSettings.defaultCity, allowance: c.amount, lodging: "", routeText: "", transportAmount: "", remark: c.note });
        }
      }
      const merged = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
      if (merged.length > OVERSEAS_ROW_CAPACITY) {
        showToast(`日別明細は最大${OVERSEAS_ROW_CAPACITY}行までのため反映できませんでした`, "error");
        return prev;
      }
      return merged;
    });
    showToast(`${calc.length}日分の手当を規定表に基づいて自動計算し反映しました`);
  };

  const applyIcStatement = () => {
    const lines = icText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      showToast("IC明細を貼り付けてください", "error");
      return;
    }
    let includedTotal = 0;
    let excludedTotal = 0;
    let includedCount = 0;
    let excludedCount = 0;
    const byDate = new Map();
    for (const line of lines) {
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      if (parts.length < 4) continue;
      const [rawDate, type, , rawAmount] = parts;
      const amount = Number(String(rawAmount).replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(amount) || amount === 0) continue;
      const date = normalizeDate(rawDate);
      if (/物販/.test(type)) {
        excludedTotal += amount;
        excludedCount += 1;
        continue;
      }
      includedTotal += amount;
      includedCount += 1;
      byDate.set(date, (byDate.get(date) || 0) + amount);
    }
    if (includedCount === 0 && excludedCount === 0) {
      showToast("有効な明細行が見つかりませんでした（日付,種別,区間,金額の形式で貼り付けてください）", "error");
      return;
    }
    setDays((prev) => {
      const map = new Map(prev.map((d) => [d.date, d]));
      for (const [date, amt] of byDate) {
        const existing = map.get(date);
        if (existing) {
          map.set(date, { ...existing, transportAmount: Number(existing.transportAmount || 0) + amt });
        } else {
          map.set(date, { id: uid(), date, city: flightSettings.defaultCity, allowance: "", lodging: "", routeText: "IC明細取込", transportAmount: amt, remark: "" });
        }
      }
      return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    });
    showToast(`交通費に${includedCount}件（¥${includedTotal.toLocaleString()}）を計上し、${excludedCount}件（物販・¥${excludedTotal.toLocaleString()}）を除外しました`);
  };

  const autoAddPerDiem = () => {
    if (!dayDraft.date) {
      showToast("日付を入力してください", "error");
      return;
    }
    setDayDraft((d) => ({ ...d, allowance: String(perDiemRate) }));
    showToast("日当を自動入力しました");
  };

  const sum = (arr, key) => arr.reduce((s, x) => s + Number(x[key] || 0), 0);
  const allowanceTotal = sum(days, "allowance");
  const lodgingTotal = sum(days, "lodging");
  const transportTotal = sum(days, "transportAmount");
  const overseasJpyTotal = allowanceTotal + lodgingTotal + transportTotal;
  const jpyRate = Number(header.rateJPY || 0);
  const overseasCnyTotal = Math.round(overseasJpyTotal * jpyRate * 100) / 100;
  const domesticCnyTotal = sum(domesticDays, "amount");
  const grandTotal = Math.round((overseasCnyTotal + domesticCnyTotal) * 100) / 100;
  const legsTotal = sum(legs, "amount");
  const transportMismatch = legs.length > 0 && legsTotal !== transportTotal;
  const weekendDayCount = days.filter((d) => {
    const day = new Date(d.date + "T00:00:00").getDay();
    return day === 0 || day === 6;
  }).length;

  const buildData = () => ({ purpose, header, days, domesticDays, legs, hotels });

  const validate = () => {
    if (!header.name.trim()) return "氏名を入力してください";
    if (days.length === 0 && domesticDays.length === 0) return "出張明細を1件以上追加してください";
    return null;
  };

  const handleSave = (status) => {
    const err = validate();
    if (err) {
      showToast(err, "error");
      return;
    }
    onSave(status, buildData());
  };

  const handleGenerate = async () => {
    const err = validate();
    if (err) {
      showToast(err, "error");
      return;
    }
    if (days.length > 0 && !header.rateJPY) {
      showToast("為替レート（1JPY→人民元）を入力してください", "error");
      return;
    }
    setGenerating(true);
    try {
      const buffer = await generateTravelExpenseExcel({
        name: header.name,
        department: header.department,
        fxRates: { USD: header.rateUSD, JPY: header.rateJPY, EUR: header.rateEUR, TWD: header.rateTWD },
        days,
        domesticDays,
        legs,
        hotels,
      });
      const first = days[0]?.date || domesticDays[0]?.date || todayStr();
      downloadExcelBuffer(buffer, `旅費精算書_${header.name}_${first}.xlsx`);
      showToast("Excelを生成しました");
    } catch (e) {
      showToast(e.message || "Excel生成に失敗しました", "error");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div style={{ ...cardStyle, background: "#EBF8FF" }}>
        <div style={{ fontSize: 12, color: "#2B6CB0", lineHeight: 1.6 }}>
          日別の出張明細を入力すると、そのまま提出用の旅費精算書（.xlsx）を生成できます。
        </div>
      </div>

      <div style={cardStyle}>
        <label style={labelStyle}>出張目的（任意・一覧表示用のメモ）</label>
        <input style={inputStyle} placeholder="例：定例営業会議" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </div>

      {/* ヘッダー情報 */}
      <div style={cardStyle}>
        <div style={sectionTitle}>基本情報</div>
        <label style={labelStyle}>氏名（姓名）</label>
        <input style={{ ...inputStyle, marginBottom: 10 }} value={header.name} onChange={(e) => setHeader((h) => ({ ...h, name: e.target.value }))} />
        <label style={labelStyle}>部門（部门）</label>
        <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="例：1部1課" value={header.department} onChange={(e) => setHeader((h) => ({ ...h, department: e.target.value }))} />
        <label style={labelStyle}>為替レート（出発日前日のレート）</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <span style={{ fontSize: 11, color: "#718096" }}>1 JPY → 人民元 *</span>
            <input type="number" step="0.000001" style={{ ...miniInput, marginTop: 3 }} value={header.rateJPY} onChange={(e) => setHeader((h) => ({ ...h, rateJPY: e.target.value }))} />
          </div>
          <div>
            <span style={{ fontSize: 11, color: "#718096" }}>1 USD → 人民元</span>
            <input type="number" step="0.0001" style={{ ...miniInput, marginTop: 3 }} value={header.rateUSD} onChange={(e) => setHeader((h) => ({ ...h, rateUSD: e.target.value }))} />
          </div>
          <div>
            <span style={{ fontSize: 11, color: "#718096" }}>1 EUR → 人民元</span>
            <input type="number" step="0.0001" style={{ ...miniInput, marginTop: 3 }} value={header.rateEUR} onChange={(e) => setHeader((h) => ({ ...h, rateEUR: e.target.value }))} />
          </div>
          <div>
            <span style={{ fontSize: 11, color: "#718096" }}>1 TWD → 人民元</span>
            <input type="number" step="0.0001" style={{ ...miniInput, marginTop: 3 }} value={header.rateTWD} onChange={(e) => setHeader((h) => ({ ...h, rateTWD: e.target.value }))} />
          </div>
        </div>
        <div style={{ ...helpText, marginTop: 8, marginBottom: 0 }}>* 人民元換算の合計計算に使用されるのは JPY レートのみです（社内レートを都度入力してください）。</div>
      </div>

      {/* 手当自動計算（フライト時刻ベースの規定表） */}
      <div style={cardStyle}>
        <div style={sectionTitle}>手当を自動計算</div>
        <div style={helpText}>出張期間とフライトの出発／到着時刻から、規定表に基づいて日別の手当を自動算定します。</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: 11, color: "#718096" }}>国</span>
            <select
              style={{ ...miniInput, marginTop: 3 }}
              value={flightSettings.country}
              onChange={(e) => setFlightSettings((f) => ({ ...f, country: e.target.value }))}
            >
              <option value="japan">日本</option>
              <option value="korea">韓国（Excel未対応・参考値のみ）</option>
            </select>
          </div>
          <div>
            <span style={{ fontSize: 11, color: "#718096" }}>役職区分</span>
            <select style={{ ...miniInput, marginTop: 3 }} value={flightSettings.rank} onChange={(e) => setFlightSettings((f) => ({ ...f, rank: e.target.value }))}>
              <option value="general">一般社員</option>
            </select>
          </div>
          <div>
            <span style={{ fontSize: 11, color: "#718096" }}>出発日</span>
            <input type="date" style={{ ...miniInput, marginTop: 3 }} value={flightSettings.startDate} onChange={(e) => setFlightSettings((f) => ({ ...f, startDate: e.target.value }))} />
          </div>
          <div>
            <span style={{ fontSize: 11, color: "#718096" }}>帰着日</span>
            <input type="date" style={{ ...miniInput, marginTop: 3 }} value={flightSettings.endDate} onChange={(e) => setFlightSettings((f) => ({ ...f, endDate: e.target.value }))} />
          </div>
        </div>
        {flightSettings.country === "japan" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <span style={{ fontSize: 11, color: "#718096" }}>出発時刻（出発日の判定に使用）</span>
              <input
                type="time"
                style={{ ...miniInput, marginTop: 3 }}
                value={flightSettings.departureTime}
                onChange={(e) => setFlightSettings((f) => ({ ...f, departureTime: e.target.value }))}
              />
            </div>
            <div>
              <span style={{ fontSize: 11, color: "#718096" }}>到着時刻（帰着日の判定に使用）</span>
              <input
                type="time"
                style={{ ...miniInput, marginTop: 3 }}
                value={flightSettings.arrivalTime}
                onChange={(e) => setFlightSettings((f) => ({ ...f, arrivalTime: e.target.value }))}
              />
            </div>
            <ReceiptUpload
              label="📷 フライト画面から出発時刻を読み取る"
              showToast={showToast}
              recognize={recognizeFlight}
              describeResult={(r) => (r.departureTime ? `出発${r.departureTime}` : null)}
              onExtracted={(r) => setFlightSettings((f) => ({ ...f, departureTime: r.departureTime || f.departureTime }))}
            />
            <ReceiptUpload
              label="📷 フライト画面から到着時刻を読み取る"
              showToast={showToast}
              recognize={recognizeFlight}
              describeResult={(r) => (r.arrivalTime ? `到着${r.arrivalTime}` : null)}
              onExtracted={(r) => setFlightSettings((f) => ({ ...f, arrivalTime: r.arrivalTime || f.arrivalTime }))}
            />
          </div>
        )}
        <label style={labelStyle}>既定の訪問都市（新規に作成される日の城市欄の初期値）</label>
        <input
          style={{ ...miniInput, marginBottom: 8 }}
          placeholder="例：大阪"
          value={flightSettings.defaultCity}
          onChange={(e) => setFlightSettings((f) => ({ ...f, defaultCity: e.target.value }))}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#4A5568", marginBottom: 10 }}>
          <input type="checkbox" checked={flightSettings.excludeWeekend} onChange={(e) => setFlightSettings((f) => ({ ...f, excludeWeekend: e.target.checked }))} />
          土日は手当を対象外にする
        </label>
        <button type="button" onClick={applyAutoAllowance} style={{ ...smallBtn, width: "100%" }}>
          🧮 {flightSettings.country === "korea" ? "手当を参考計算する（USD・反映不可）" : "手当を自動計算して日別明細に反映"}
        </button>
        {koreaPreview && (
          <div style={{ marginTop: 10, background: "#FFFAF0", borderRadius: 8, padding: 8 }}>
            {koreaPreview.map((c) => (
              <div key={c.date} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#4A5568", padding: "3px 0" }}>
                <span>{c.date}（{c.note}）</span>
                <span>{c.amount} USD</span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: "#B7791F", marginTop: 4 }}>韓国様式のExcelテンプレートをいただき次第、自動反映に対応します。</div>
          </div>
        )}
      </div>

      {/* IC明細の一括取り込み */}
      <div style={cardStyle}>
        <div style={sectionTitle}>IC明細の一括取り込み（任意）</div>
        <div style={helpText}>
          「日付,種別,区間,金額」の形式で1行1件貼り付けてください（カンマまたはタブ区切り）。種別に「物販」を含む行は交通費から自動的に除外されます。
        </div>
        <textarea
          style={{ ...inputStyle, minHeight: 90, marginBottom: 8, resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
          placeholder={"2026-07-21,乗車,新大阪→岐阜羽島,970\n2026-07-21,物販,コンビニ,350"}
          value={icText}
          onChange={(e) => setIcText(e.target.value)}
        />
        <button type="button" onClick={applyIcStatement} style={{ ...smallBtn, width: "100%" }}>
          ＋ 交通費に取り込む（物販を除外）
        </button>
      </div>

      {/* 日別出張明細（海外＝日本国内） */}
      <div style={cardStyle}>
        <div style={sectionTitle}>日別出張明細（海外＝日本国内）</div>
        <div style={helpText}>最大{OVERSEAS_ROW_CAPACITY}日分。日付・訪問都市（城市）・日当・宿泊費・交通費・備考を入力します。</div>
        <EntryList
          entries={days}
          onRemove={removeDay}
          render={(d) => (
            <>
              <b>{d.date}</b>　{d.city}　日当{fmtYen(d.allowance)}／宿泊{fmtYen(d.lodging)}／交通{fmtYen(d.transportAmount)}
              {d.routeText ? `（${d.routeText}）` : ""}
              {d.remark ? <div style={{ color: "#A0AEC0" }}>{d.remark}</div> : null}
            </>
          )}
        />
        {days.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, borderTop: "1px solid #EDF2F7", paddingTop: 8, marginBottom: 10 }}>
            <span style={{ color: "#4A5568" }}>小計（日当＋宿泊＋交通）</span>
            <span style={{ color: "#1A2980" }}>{fmtYen(overseasJpyTotal)}</span>
          </div>
        )}
        <div style={{ background: "#F7FAFC", borderRadius: 10, padding: 10 }}>
          <div style={rowGrid}>
            <input type="date" style={miniInput} value={dayDraft.date} onChange={(e) => setDayDraft((d) => ({ ...d, date: e.target.value }))} />
            <input style={miniInput} placeholder="城市（例：大阪）" value={dayDraft.city} onChange={(e) => setDayDraft((d) => ({ ...d, city: e.target.value }))} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <input type="number" style={miniInput} placeholder="日当(円)" value={dayDraft.allowance} onChange={(e) => setDayDraft((d) => ({ ...d, allowance: e.target.value }))} />
              <input type="number" style={miniInput} placeholder="宿泊費(円)" value={dayDraft.lodging} onChange={(e) => setDayDraft((d) => ({ ...d, lodging: e.target.value }))} />
            </div>
            <button type="button" onClick={autoAddPerDiem} style={{ fontSize: 11, background: "#EBF8FF", color: "#2B6CB0", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>
              💴 日当を設定値（{fmtYen(perDiemRate)}）で自動入力
            </button>
            <ReceiptUpload
              label="📷 宿泊費の領収書から金額を読み取る"
              showToast={showToast}
              onExtracted={(r) => setDayDraft((d) => ({ ...d, lodging: r.amount != null ? String(r.amount) : d.lodging }))}
            />
            <input style={miniInput} placeholder="乗降地・経路（例：新大阪→岐阜羽島）" value={dayDraft.routeText} onChange={(e) => setDayDraft((d) => ({ ...d, routeText: e.target.value }))} />
            <input type="number" style={miniInput} placeholder="交通費(円)" value={dayDraft.transportAmount} onChange={(e) => setDayDraft((d) => ({ ...d, transportAmount: e.target.value }))} />
            <ReceiptUpload
              label="📷 タクシー等の領収書から金額を読み取る"
              showToast={showToast}
              onExtracted={(r) => setDayDraft((d) => ({ ...d, transportAmount: r.amount != null ? String(r.amount) : d.transportAmount }))}
            />
            <input style={miniInput} placeholder="備考" value={dayDraft.remark} onChange={(e) => setDayDraft((d) => ({ ...d, remark: e.target.value }))} />
          </div>
          <button onClick={addDay} style={{ ...smallBtn, width: "100%" }}>
            ＋ 日別明細を追加
          </button>
        </div>
      </div>

      {/* 国内（中国）出張 */}
      <div style={cardStyle}>
        <div style={sectionTitle}>国内（中国国内）出張費（任意）</div>
        <div style={helpText}>最大{DOMESTIC_ROW_CAPACITY}行。金額は人民元（CNY）で入力します。</div>
        <EntryList
          entries={domesticDays}
          onRemove={removeDomestic}
          render={(d) => (
            <>
              <b>{d.date}</b>　{d.location}／{d.method}　{fmtCny(d.amount)}
            </>
          )}
        />
        <div style={{ background: "#F7FAFC", borderRadius: 10, padding: 10 }}>
          <div style={rowGrid}>
            <input type="date" style={miniInput} value={domesticDraft.date} onChange={(e) => setDomesticDraft((d) => ({ ...d, date: e.target.value }))} />
            <input style={miniInput} placeholder="移動地点" value={domesticDraft.location} onChange={(e) => setDomesticDraft((d) => ({ ...d, location: e.target.value }))} />
            <input style={miniInput} placeholder="手段（例：出租车/地铁/其他）" value={domesticDraft.method} onChange={(e) => setDomesticDraft((d) => ({ ...d, method: e.target.value }))} />
            <input type="number" style={miniInput} placeholder="金額(人民元)" value={domesticDraft.amount} onChange={(e) => setDomesticDraft((d) => ({ ...d, amount: e.target.value }))} />
          </div>
          <button onClick={addDomestic} style={{ ...smallBtn, width: "100%" }}>
            ＋ 国内出張費を追加
          </button>
        </div>
      </div>

      {/* 明細（内訳）任意 */}
      <div style={cardStyle}>
        <button onClick={() => setShowDetail((s) => !s)} style={{ ...sectionTitle, background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left" }}>
          {showDetail ? "▾" : "▸"} 明細シート（交通費・宿泊費の内訳／任意）
        </button>
        {showDetail && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>交通費内訳（最大{LEG_ROW_CAPACITY}件）</div>
            <EntryList
              entries={legs}
              onRemove={removeLeg}
              render={(l) => (
                <>
                  {l.date}　{l.from}→{l.to}　{fmtYen(l.amount)}（{l.method}）{l.memo ? ` ${l.memo}` : ""}
                </>
              )}
            />
            <div style={{ background: "#F7FAFC", borderRadius: 10, padding: 10, marginBottom: 14 }}>
              <div style={rowGrid}>
                <input type="date" style={miniInput} value={legDraft.date} onChange={(e) => setLegDraft((d) => ({ ...d, date: e.target.value }))} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <input style={miniInput} placeholder="出発" value={legDraft.from} onChange={(e) => setLegDraft((d) => ({ ...d, from: e.target.value }))} />
                  <input style={miniInput} placeholder="到着" value={legDraft.to} onChange={(e) => setLegDraft((d) => ({ ...d, to: e.target.value }))} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <input type="number" style={miniInput} placeholder="金額(円)" value={legDraft.amount} onChange={(e) => setLegDraft((d) => ({ ...d, amount: e.target.value }))} />
                  <input style={miniInput} placeholder="手段" value={legDraft.method} onChange={(e) => setLegDraft((d) => ({ ...d, method: e.target.value }))} />
                </div>
                <input style={miniInput} placeholder="メモ" value={legDraft.memo} onChange={(e) => setLegDraft((d) => ({ ...d, memo: e.target.value }))} />
                <ReceiptUpload
                  label="📷 タクシー領収書・交通明細から読み取る"
                  showToast={showToast}
                  onExtracted={(r) =>
                    setLegDraft((d) => ({
                      ...d,
                      amount: r.amount != null ? String(r.amount) : d.amount,
                      date: r.date || d.date,
                      memo: d.memo || r.memo,
                    }))
                  }
                />
              </div>
              <button onClick={addLeg} style={{ ...smallBtn, width: "100%" }}>
                ＋ 交通費内訳を追加
              </button>
            </div>

            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>宿泊内訳（最大{HOTEL_ROW_CAPACITY}件）</div>
            <EntryList
              entries={hotels}
              onRemove={removeHotel}
              render={(h) => (
                <>
                  {h.period}　{h.hotelName}　{fmtYen(h.amount)}
                </>
              )}
            />
            <div style={{ background: "#F7FAFC", borderRadius: 10, padding: 10 }}>
              <div style={rowGrid}>
                <input style={miniInput} placeholder="期間（例：7/21-22）" value={hotelDraft.period} onChange={(e) => setHotelDraft((d) => ({ ...d, period: e.target.value }))} />
                <input style={miniInput} placeholder="ホテル名" value={hotelDraft.hotelName} onChange={(e) => setHotelDraft((d) => ({ ...d, hotelName: e.target.value }))} />
                <input type="number" style={miniInput} placeholder="金額(円)" value={hotelDraft.amount} onChange={(e) => setHotelDraft((d) => ({ ...d, amount: e.target.value }))} />
                <ReceiptUpload
                  label="📷 ホテル領収書から読み取る"
                  showToast={showToast}
                  onExtracted={(r) =>
                    setHotelDraft((d) => ({
                      ...d,
                      amount: r.amount != null ? String(r.amount) : d.amount,
                      hotelName: d.hotelName || r.memo,
                    }))
                  }
                />
              </div>
              <button onClick={addHotel} style={{ ...smallBtn, width: "100%" }}>
                ＋ 宿泊内訳を追加
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 計算プレビュー */}
      <div style={cardStyle}>
        <div style={sectionTitle}>計算プレビュー</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0" }}>
          <span style={{ color: "#718096" }}>外币合计（海外・円）</span>
          <span>{fmtYen(overseasJpyTotal)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0" }}>
          <span style={{ color: "#718096" }}>折合人民币合计（海外）</span>
          <span>{fmtCny(overseasCnyTotal)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0" }}>
          <span style={{ color: "#718096" }}>国内差旅费（人民元）</span>
          <span>{fmtCny(domesticCnyTotal)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, padding: "8px 0 0", borderTop: "1px solid #EDF2F7", marginTop: 4 }}>
          <span style={{ color: "#4A5568" }}>総金額</span>
          <span style={{ color: "#1A2980" }}>{fmtCny(grandTotal)}</span>
        </div>

        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #EDF2F7" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#2D3748", marginBottom: 6 }}>検算</div>
          {legs.length > 0 && (
            <div style={{ fontSize: 12, color: transportMismatch ? "#C53030" : "#2F855A", marginBottom: 3 }}>
              {transportMismatch ? "⚠" : "✅"} 明細シートの交通合計（{fmtYen(legsTotal)}）と日別交通費合計（{fmtYen(transportTotal)}）
              {transportMismatch ? "が一致しません" : "が一致しています"}
            </div>
          )}
          {weekendDayCount > 0 && (
            <div style={{ fontSize: 12, color: "#718096" }}>
              ℹ 出張期間中に土日が{weekendDayCount}日含まれています{flightSettings.excludeWeekend ? "（手当対象外の設定が有効です）" : "（必要に応じて手当・交通費を除外してください）"}
            </div>
          )}
          {legs.length === 0 && weekendDayCount === 0 && <div style={{ fontSize: 12, color: "#A0AEC0" }}>特に警告はありません。</div>}
        </div>
      </div>

      <button style={{ ...primaryBtn, background: "#2B6CB0", marginBottom: 10 }} onClick={handleGenerate} disabled={generating}>
        {generating ? "生成中..." : "📥 Excelをダウンロード（旅費精算書）"}
      </button>

      <div style={{ display: "flex", gap: 10 }}>
        <button style={ghostBtn} onClick={onCancel}>
          キャンセル
        </button>
        <button style={ghostBtn} onClick={() => handleSave("draft")}>
          下書き保存
        </button>
        <button style={primaryBtn} onClick={() => handleSave("submitted")}>
          提出する
        </button>
      </div>
    </div>
  );
}
