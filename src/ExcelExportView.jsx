import { useState } from "react";
import { cardStyle, labelStyle, inputStyle, primaryBtn } from "./styles.js";
import ReceiptUpload from "./ReceiptUpload.jsx";
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

export default function ExcelExportView({ currentUser, showToast }) {
  const [header, setHeader] = useState({ name: currentUser.name, department: "", rateUSD: "", rateJPY: "", rateEUR: "", rateTWD: "" });
  const [days, setDays] = useState([]);
  const [dayDraft, setDayDraft] = useState(emptyDay());
  const [domesticDays, setDomesticDays] = useState([]);
  const [domesticDraft, setDomesticDraft] = useState(emptyDomestic());
  const [showDetail, setShowDetail] = useState(false);
  const [legs, setLegs] = useState([]);
  const [legDraft, setLegDraft] = useState(emptyLeg());
  const [hotels, setHotels] = useState([]);
  const [hotelDraft, setHotelDraft] = useState(emptyHotel());
  const [generating, setGenerating] = useState(false);

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

  const sum = (arr, key) => arr.reduce((s, x) => s + Number(x[key] || 0), 0);
  const allowanceTotal = sum(days, "allowance");
  const lodgingTotal = sum(days, "lodging");
  const transportTotal = sum(days, "transportAmount");
  const overseasJpyTotal = allowanceTotal + lodgingTotal + transportTotal;
  const jpyRate = Number(header.rateJPY || 0);
  const overseasCnyTotal = Math.round(overseasJpyTotal * jpyRate * 100) / 100;
  const domesticCnyTotal = sum(domesticDays, "amount");
  const grandTotal = Math.round((overseasCnyTotal + domesticCnyTotal) * 100) / 100;

  const handleGenerate = async () => {
    if (!header.name.trim()) {
      showToast("氏名を入力してください", "error");
      return;
    }
    if (days.length === 0 && domesticDays.length === 0) {
      showToast("出張明細を1件以上追加してください", "error");
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
          社内テンプレート「国外差旅费报销单」に沿って旅費精算書（.xlsx）を生成します。日別の出張明細を入力し、最後に「Excelをダウンロード」を押してください。
        </div>
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
        <div style={{ ...helpText, marginTop: 8, marginBottom: 0 }}>* 人民元換算の合計計算に使用されるのは JPY レートのみです。</div>
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
      </div>

      <button style={primaryBtn} onClick={handleGenerate} disabled={generating}>
        {generating ? "生成中..." : "📥 Excelをダウンロード（旅費精算書）"}
      </button>
    </div>
  );
}
