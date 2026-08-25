import { useState } from "react";
import TripForm from "./TripForm.jsx";
import { generateTravelExpenseExcel, downloadExcelBuffer } from "./excelTemplate.js";
import { cardStyle, labelStyle, inputStyle, overlay, modal, primaryBtn, ghostBtn } from "./styles.js";

/* ---------------- データ定義 ---------------- */
const DEFAULT_PROFILE = { name: "田中 太郎", dept: "営業部" };
const DEFAULT_PER_DIEM_RATE = 3000;

const STATUS = {
  draft: { label: "下書き", color: "#718096", bg: "#EDF2F7" },
  submitted: { label: "提出済み", color: "#DD6B20", bg: "#FFFAF0" },
  paid: { label: "精算済み", color: "#2B6CB0", bg: "#EBF8FF" },
};

/* ---------------- ヘルパー ---------------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return `${dt.getMonth() + 1}/${dt.getDate()}(${days[dt.getDay()]})`;
};
const fmtYen = (n) => `¥${Number(n || 0).toLocaleString()}`;
const fmtCny = (n) => `CN¥${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const allDates = (trip) => [...(trip.days || []).map((d) => d.date), ...(trip.domesticDays || []).map((d) => d.date)].filter(Boolean).sort();
const tripDateRange = (trip) => {
  const dates = allDates(trip);
  return { start: dates[0] || "", end: dates[dates.length - 1] || "" };
};
const tripDestination = (trip) => {
  const cities = [];
  for (const d of trip.days || []) {
    if (d.city && cities[cities.length - 1] !== d.city) cities.push(d.city);
  }
  return cities.length ? cities.join("・") : "（行先未入力）";
};
const tripOverseasTotal = (trip) =>
  (trip.days || []).reduce((s, d) => s + Number(d.allowance || 0) + Number(d.lodging || 0) + Number(d.transportAmount || 0), 0);
const tripDomesticTotal = (trip) => (trip.domesticDays || []).reduce((s, d) => s + Number(d.amount || 0), 0);
const tripEntryCount = (trip) => (trip.days || []).length + (trip.domesticDays || []).length;

/* ---------------- サンプルデータ ---------------- */
const seedTrips = () => [
  {
    id: uid(),
    purpose: "定例営業会議",
    header: { name: DEFAULT_PROFILE.name, department: "1部1課", rateUSD: "", rateJPY: "0.0485", rateEUR: "", rateTWD: "" },
    days: [
      { id: uid(), date: "2026-08-10", city: "大阪", allowance: 3000, lodging: 12000, routeText: "東京→新大阪", transportAmount: 28000, remark: "" },
      { id: uid(), date: "2026-08-11", city: "大阪", allowance: 3000, lodging: 0, routeText: "新大阪→東京", transportAmount: 0, remark: "" },
    ],
    domesticDays: [],
    legs: [],
    hotels: [],
    status: "submitted",
    createdAt: "2026-08-09T10:00:00.000Z",
    submittedAt: "2026-08-09T10:05:00.000Z",
  },
  {
    id: uid(),
    purpose: "システム導入立会い",
    header: { name: DEFAULT_PROFILE.name, department: "1部1課", rateUSD: "", rateJPY: "0.0485", rateEUR: "", rateTWD: "" },
    days: [
      { id: uid(), date: "2026-07-20", city: "福岡", allowance: 3000, lodging: 8000, routeText: "羽田→福岡", transportAmount: 45000, remark: "" },
      { id: uid(), date: "2026-07-21", city: "福岡", allowance: 3000, lodging: 8000, routeText: "", transportAmount: 0, remark: "" },
      { id: uid(), date: "2026-07-22", city: "福岡", allowance: 3000, lodging: 0, routeText: "福岡→羽田", transportAmount: 3000, remark: "会議室利用料含む" },
    ],
    domesticDays: [],
    legs: [],
    hotels: [],
    status: "paid",
    createdAt: "2026-07-19T09:00:00.000Z",
    submittedAt: "2026-07-19T09:10:00.000Z",
    paidAt: "2026-07-25T14:00:00.000Z",
  },
];

/* ---------------- 小コンポーネント ---------------- */
function StatusBadge({ status }) {
  const s = STATUS[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function TripCard({ trip, onClick }) {
  const { start, end } = tripDateRange(trip);
  const jpyTotal = tripOverseasTotal(trip);
  const cnyTotal = tripDomesticTotal(trip);
  return (
    <div style={{ ...cardStyle, cursor: "pointer" }} onClick={onClick}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#2D3748" }}>{tripDestination(trip)}</div>
          <div style={{ fontSize: 12, color: "#718096", marginTop: 2 }}>
            {start ? `${fmtDate(start)} 〜 ${fmtDate(end)}` : "日程未入力"}
          </div>
          {trip.purpose && <div style={{ fontSize: 12, color: "#A0AEC0", marginTop: 4 }}>{trip.purpose}</div>}
        </div>
        <StatusBadge status={trip.status} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, borderTop: "1px solid #EDF2F7", paddingTop: 8 }}>
        <span style={{ fontSize: 11, color: "#A0AEC0" }}>{tripEntryCount(trip)}件の明細</span>
        <span style={{ textAlign: "right" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#1A2980" }}>{fmtYen(jpyTotal)}</span>
          {cnyTotal > 0 && <div style={{ fontSize: 11, color: "#718096" }}>+ {fmtCny(cnyTotal)}</div>}
        </span>
      </div>
    </div>
  );
}

/* ---------------- メインアプリ ---------------- */
export default function App() {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [view, setView] = useState("list");
  const [trips, setTrips] = useState(seedTrips);
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [perDiemRate, setPerDiemRate] = useState(DEFAULT_PER_DIEM_RATE);
  const [generatingId, setGeneratingId] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const detailTrip = trips.find((t) => t.id === detailId) || null;

  const openNewForm = () => {
    setEditingId(null);
    setView("form");
  };
  const openEditForm = (trip) => {
    setEditingId(trip.id);
    setDetailId(null);
    setView("form");
  };

  const handleSaveTrip = (status, data) => {
    const now = new Date().toISOString();
    if (editingId) {
      setTrips((prev) =>
        prev.map((t) => (t.id === editingId ? { ...t, ...data, status, submittedAt: status === "submitted" ? now : t.submittedAt, updatedAt: now } : t))
      );
    } else {
      setTrips((prev) => [{ id: uid(), ...data, status, createdAt: now, submittedAt: status === "submitted" ? now : undefined }, ...prev]);
    }
    showToast(status === "submitted" ? "提出済みにしました" : "下書きを保存しました");
    setEditingId(null);
    setView("list");
  };

  const deleteTrip = (id) => {
    setTrips((prev) => prev.filter((t) => t.id !== id));
    setConfirmDelete(null);
    setDetailId(null);
    showToast("記録を削除しました", "info");
  };

  const markPaid = (id) => {
    setTrips((prev) => prev.map((t) => (t.id === id ? { ...t, status: "paid", paidAt: new Date().toISOString() } : t)));
    setDetailId(null);
    showToast("精算済みにしました");
  };

  const downloadTripExcel = async (trip) => {
    if (!trip.header?.name?.trim()) {
      showToast("氏名が未入力です。編集画面で入力してください", "error");
      return;
    }
    if ((trip.days || []).length > 0 && !trip.header?.rateJPY) {
      showToast("為替レート（1JPY→人民元）が未入力です。編集画面で入力してください", "error");
      return;
    }
    setGeneratingId(trip.id);
    try {
      const buffer = await generateTravelExpenseExcel({
        name: trip.header.name,
        department: trip.header.department,
        fxRates: { USD: trip.header.rateUSD, JPY: trip.header.rateJPY, EUR: trip.header.rateEUR, TWD: trip.header.rateTWD },
        days: trip.days,
        domesticDays: trip.domesticDays,
        legs: trip.legs,
        hotels: trip.hotels,
      });
      const { start } = tripDateRange(trip);
      downloadExcelBuffer(buffer, `旅費精算書_${trip.header.name}_${start || "trip"}.xlsx`);
      showToast("Excelを生成しました");
    } catch (e) {
      showToast(e.message || "Excel生成に失敗しました", "error");
    } finally {
      setGeneratingId(null);
    }
  };

  const myTrips = trips
    .filter((t) => statusFilter === "all" || t.status === statusFilter)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const stats = {
    submitted: trips.filter((t) => t.status === "submitted").length,
    paidTotal: trips.filter((t) => t.status === "paid").reduce((s, t) => s + tripOverseasTotal(t), 0),
  };

  const editingTrip = editingId ? trips.find((t) => t.id === editingId) : null;

  /* ---------------- 画面描画 ---------------- */
  return (
    <div style={{ minHeight: "100vh", background: "#F0F4F8", fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", maxWidth: 480, margin: "0 auto", paddingBottom: 30 }}>
      {/* ヘッダー */}
      <div style={{ background: "linear-gradient(135deg,#1A2980 0%,#26D0CE 100%)", padding: "16px 18px 12px", color: "#fff", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>🧾 出張旅費精算</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>{profile.name}（{profile.dept}）</div>
          </div>
          <button onClick={() => setView("settings")} style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 20, padding: "5px 12px", color: "#fff", fontSize: 12, cursor: "pointer" }}>
            ⚙ 設定
          </button>
        </div>
      </div>

      {/* タブ */}
      {view !== "form" && (
        <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #E2E8F0", position: "sticky", top: 68, zIndex: 99 }}>
          {[
            { key: "list", label: "📋 一覧" },
            { key: "settings", label: "⚙ 設定" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              style={{
                flex: 1,
                padding: "10px 0",
                fontSize: 12,
                fontWeight: view === tab.key ? 700 : 400,
                color: view === tab.key ? "#1A2980" : "#718096",
                background: "none",
                border: "none",
                cursor: "pointer",
                borderBottom: view === tab.key ? "2px solid #1A2980" : "2px solid transparent",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: 14 }}>
        {/* ---- 一覧 ---- */}
        {view === "list" && (
          <>
            <button style={{ ...primaryBtn, marginBottom: 14 }} onClick={openNewForm}>
              ＋ 新規記録（Excel生成もここから）
            </button>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 2 }}>
              {[{ key: "all", label: "すべて" }, ...Object.entries(STATUS).map(([key, v]) => ({ key, label: v.label }))].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  style={{
                    flexShrink: 0,
                    fontSize: 12,
                    padding: "6px 12px",
                    borderRadius: 20,
                    border: statusFilter === f.key ? "1px solid #1A2980" : "1px solid #E2E8F0",
                    background: statusFilter === f.key ? "#1A2980" : "#fff",
                    color: statusFilter === f.key ? "#fff" : "#4A5568",
                    cursor: "pointer",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {myTrips.length === 0 ? (
              <div style={{ textAlign: "center", color: "#A0AEC0", padding: "60px 0", fontSize: 13 }}>
                記録はまだありません。
                <br />
                「＋ 新規記録」から出張精算を記録しましょう。
              </div>
            ) : (
              myTrips.map((t) => <TripCard key={t.id} trip={t} onClick={() => setDetailId(t.id)} />)
            )}
          </>
        )}

        {/* ---- 新規/編集記録（Excel生成もここで行う） ---- */}
        {view === "form" && (
          <TripForm
            key={editingId || "new"}
            initial={editingTrip}
            profile={profile}
            perDiemRate={perDiemRate}
            showToast={showToast}
            onCancel={() => setView(editingId ? "list" : "list")}
            onSave={handleSaveTrip}
          />
        )}

        {/* ---- 設定 ---- */}
        {view === "settings" && (
          <>
            <div style={cardStyle}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "#2D3748" }}>プロフィール</div>
              <label style={labelStyle}>氏名</label>
              <input style={{ ...inputStyle, marginBottom: 10 }} value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
              <label style={labelStyle}>部署</label>
              <input style={inputStyle} value={profile.dept} onChange={(e) => setProfile((p) => ({ ...p, dept: e.target.value }))} />
              <div style={{ fontSize: 11, color: "#A0AEC0", marginTop: 6 }}>新規記録の初期値として使用されます。</div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "#2D3748" }}>日当単価</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="number" style={inputStyle} value={perDiemRate} onChange={(e) => setPerDiemRate(Number(e.target.value) || 0)} />
                <span style={{ fontSize: 13, color: "#718096", flexShrink: 0 }}>円 ／ 日</span>
              </div>
              <div style={{ fontSize: 11, color: "#A0AEC0", marginTop: 6 }}>記録画面の「日当を自動入力」で使用される単価です。</div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "#2D3748" }}>サマリー</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #EDF2F7" }}>
                <span style={{ color: "#718096" }}>提出済み（精算待ち）</span>
                <span style={{ fontWeight: 700 }}>{stats.submitted} 件</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0" }}>
                <span style={{ color: "#718096" }}>精算済み合計（円・海外分）</span>
                <span style={{ fontWeight: 700, color: "#1A2980" }}>{fmtYen(stats.paidTotal)}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ---- 詳細モーダル ---- */}
      {detailTrip && (
        <div style={overlay} onClick={() => setDetailId(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3748" }}>{tripDestination(detailTrip)}</div>
                <div style={{ fontSize: 12, color: "#718096", marginTop: 2 }}>
                  {(() => {
                    const { start, end } = tripDateRange(detailTrip);
                    return start ? `${fmtDate(start)} 〜 ${fmtDate(end)}` : "日程未入力";
                  })()}
                </div>
              </div>
              <StatusBadge status={detailTrip.status} />
            </div>
            {detailTrip.purpose && <div style={{ fontSize: 13, color: "#4A5568", background: "#F7FAFC", borderRadius: 8, padding: 8, marginBottom: 12 }}>{detailTrip.purpose}</div>}

            {(detailTrip.days || []).length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#2D3748", marginBottom: 6 }}>日別明細（海外）</div>
                {detailTrip.days.map((d) => (
                  <div key={d.id} style={{ padding: "7px 0", borderBottom: "1px solid #EDF2F7" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#4A5568" }}>
                      <span>{fmtDate(d.date)} {d.city}</span>
                      <span style={{ fontWeight: 700 }}>{fmtYen(Number(d.allowance || 0) + Number(d.lodging || 0) + Number(d.transportAmount || 0))}</span>
                    </div>
                    {(d.routeText || d.remark) && (
                      <div style={{ fontSize: 11, color: "#A0AEC0" }}>{[d.routeText, d.remark].filter(Boolean).join(" ／ ")}</div>
                    )}
                  </div>
                ))}
              </>
            )}

            {(detailTrip.domesticDays || []).length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#2D3748", margin: "10px 0 6px" }}>国内（中国国内）出張費</div>
                {detailTrip.domesticDays.map((d) => (
                  <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #EDF2F7", fontSize: 13, color: "#4A5568" }}>
                    <span>{fmtDate(d.date)} {d.location}／{d.method}</span>
                    <span style={{ fontWeight: 700 }}>{fmtCny(d.amount)}</span>
                  </div>
                ))}
              </>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontWeight: 700 }}>
              <span style={{ color: "#4A5568" }}>合計金額（円・海外分）</span>
              <span style={{ fontSize: 18, color: "#1A2980" }}>{fmtYen(tripOverseasTotal(detailTrip))}</span>
            </div>

            <button style={{ ...primaryBtn, background: "#2B6CB0", marginTop: 16 }} onClick={() => downloadTripExcel(detailTrip)} disabled={generatingId === detailTrip.id}>
              {generatingId === detailTrip.id ? "生成中..." : "📥 Excelをダウンロード（旅費精算書）"}
            </button>

            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button style={ghostBtn} onClick={() => setConfirmDelete(detailTrip.id)}>
                削除
              </button>
              {detailTrip.status !== "paid" && (
                <button style={ghostBtn} onClick={() => openEditForm(detailTrip)}>
                  編集する
                </button>
              )}
            </div>

            {detailTrip.status === "submitted" && (
              <button style={{ ...primaryBtn, marginTop: 10 }} onClick={() => markPaid(detailTrip.id)}>
                精算済みにする
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---- 削除確認 ---- */}
      {confirmDelete && (
        <div style={overlay} onClick={() => setConfirmDelete(null)}>
          <div style={{ ...modal, borderRadius: 16, maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, color: "#2D3748", marginBottom: 16, textAlign: "center" }}>この記録を削除しますか？</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={ghostBtn} onClick={() => setConfirmDelete(null)}>
                キャンセル
              </button>
              <button style={{ ...primaryBtn, background: "#C53030" }} onClick={() => deleteTrip(confirmDelete)}>
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- トースト ---- */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: toast.type === "error" ? "#C53030" : toast.type === "info" ? "#2B6CB0" : "#2F855A",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 20,
            fontSize: 13,
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            zIndex: 200,
            maxWidth: "90%",
            textAlign: "center",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
