import { useState } from "react";
import ExcelExportView from "./ExcelExportView.jsx";
import { navBtn, cardStyle, labelStyle, inputStyle, overlay, modal, primaryBtn, ghostBtn } from "./styles.js";

/* ---------------- データ定義 ---------------- */
const DEFAULT_PROFILE = { name: "田中 太郎", dept: "営業部" };

const ITEM_TYPES = [
  { key: "transport", label: "交通費", icon: "🚃" },
  { key: "lodging", label: "宿泊費", icon: "🏨" },
  { key: "allowance", label: "日当", icon: "💴" },
  { key: "other", label: "その他", icon: "📎" },
];
const itemMeta = (key) => ITEM_TYPES.find((t) => t.key === key) || ITEM_TYPES[3];

const STATUS = {
  draft: { label: "下書き", color: "#718096", bg: "#EDF2F7" },
  submitted: { label: "提出済み", color: "#DD6B20", bg: "#FFFAF0" },
  paid: { label: "精算済み", color: "#2B6CB0", bg: "#EBF8FF" },
};

const DEFAULT_PER_DIEM_RATE = 3000;

/* ---------------- ヘルパー ---------------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtDate = (d) => {
  const dt = new Date(d + "T00:00:00");
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return `${dt.getMonth() + 1}/${dt.getDate()}(${days[dt.getDay()]})`;
};
const fmtYen = (n) => `¥${Number(n || 0).toLocaleString()}`;
const daysBetween = (s, e) => {
  if (!s || !e) return 0;
  return Math.round((new Date(e + "T00:00:00") - new Date(s + "T00:00:00")) / 86400000) + 1;
};
const itemsTotal = (items) => items.reduce((sum, i) => sum + Number(i.amount || 0), 0);
const emptyForm = () => ({
  destination: "",
  purpose: "",
  startDate: todayStr(),
  endDate: todayStr(),
  items: [],
});
const emptyItemDraft = () => ({ type: "transport", desc: "", amount: "" });

/* ---------------- サンプルデータ ---------------- */
const seedReports = () => [
  {
    id: uid(),
    destination: "大阪支店",
    purpose: "定例営業会議",
    startDate: "2026-08-10",
    endDate: "2026-08-11",
    items: [
      { id: uid(), type: "transport", desc: "新幹線（東京⇔新大阪）", amount: 28000 },
      { id: uid(), type: "lodging", desc: "大阪ステーションホテル 1泊", amount: 12000 },
      { id: uid(), type: "allowance", desc: "日当（2日）", amount: 6000 },
    ],
    status: "submitted",
    createdAt: "2026-08-09T10:00:00.000Z",
    submittedAt: "2026-08-09T10:05:00.000Z",
  },
  {
    id: uid(),
    destination: "福岡センター",
    purpose: "システム導入立会い",
    startDate: "2026-07-20",
    endDate: "2026-07-22",
    items: [
      { id: uid(), type: "transport", desc: "飛行機（羽田⇔福岡）", amount: 45000 },
      { id: uid(), type: "lodging", desc: "ビジネスホテル 2泊", amount: 16000 },
      { id: uid(), type: "allowance", desc: "日当（3日）", amount: 9000 },
      { id: uid(), type: "other", desc: "会議室利用料", amount: 3000 },
    ],
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

function ReportCard({ report, onClick }) {
  const total = itemsTotal(report.items);
  return (
    <div style={{ ...cardStyle, cursor: "pointer" }} onClick={onClick}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#2D3748" }}>{report.destination || "（行先未入力）"}</div>
          <div style={{ fontSize: 12, color: "#718096", marginTop: 2 }}>
            {fmtDate(report.startDate)} 〜 {fmtDate(report.endDate)}
          </div>
          {report.purpose && <div style={{ fontSize: 12, color: "#A0AEC0", marginTop: 4 }}>{report.purpose}</div>}
        </div>
        <StatusBadge status={report.status} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, borderTop: "1px solid #EDF2F7", paddingTop: 8 }}>
        <span style={{ fontSize: 11, color: "#A0AEC0" }}>{report.items.length}件の明細</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#1A2980" }}>{fmtYen(total)}</span>
      </div>
    </div>
  );
}

/* ---------------- メインアプリ ---------------- */
export default function App() {
  const [currentUser, setCurrentUser] = useState(DEFAULT_PROFILE);
  const [view, setView] = useState("list");
  const [reports, setReports] = useState(seedReports);
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState(emptyForm());
  const [itemDraft, setItemDraft] = useState(emptyItemDraft());
  const [editingId, setEditingId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [perDiemRate, setPerDiemRate] = useState(DEFAULT_PER_DIEM_RATE);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const detailReport = reports.find((r) => r.id === detailId) || null;

  /* ---- フォーム操作 ---- */
  const openNewForm = () => {
    setForm(emptyForm());
    setItemDraft(emptyItemDraft());
    setEditingId(null);
    setView("new");
  };

  const openEditForm = (report) => {
    setForm({
      destination: report.destination,
      purpose: report.purpose,
      startDate: report.startDate,
      endDate: report.endDate,
      items: report.items,
    });
    setItemDraft(emptyItemDraft());
    setEditingId(report.id);
    setDetailId(null);
    setView("new");
  };

  const addItem = () => {
    if (!itemDraft.desc.trim()) {
      showToast("明細の内容を入力してください", "error");
      return;
    }
    if (!itemDraft.amount || Number(itemDraft.amount) <= 0) {
      showToast("金額を正しく入力してください", "error");
      return;
    }
    setForm((f) => ({ ...f, items: [...f.items, { id: uid(), ...itemDraft, amount: Number(itemDraft.amount) }] }));
    setItemDraft(emptyItemDraft());
  };

  const removeItem = (id) => setForm((f) => ({ ...f, items: f.items.filter((i) => i.id !== id) }));

  const autoAddPerDiem = () => {
    const days = daysBetween(form.startDate, form.endDate);
    if (days <= 0) {
      showToast("出張期間を正しく入力してください", "error");
      return;
    }
    setForm((f) => ({
      ...f,
      items: [...f.items, { id: uid(), type: "allowance", desc: `日当（${days}日）`, amount: days * perDiemRate }],
    }));
    showToast("日当を追加しました");
  };

  const validateForm = () => {
    if (!form.destination.trim()) return "出張先を入力してください";
    if (!form.purpose.trim()) return "出張目的を入力してください";
    if (form.startDate > form.endDate) return "終了日は開始日以降にしてください";
    if (form.items.length === 0) return "経費明細を1件以上追加してください";
    return null;
  };

  const saveReport = (status) => {
    const err = validateForm();
    if (err) {
      showToast(err, "error");
      return;
    }
    const now = new Date().toISOString();
    if (editingId) {
      setReports((prev) =>
        prev.map((r) => (r.id === editingId ? { ...r, ...form, status, submittedAt: status === "submitted" ? now : r.submittedAt, updatedAt: now } : r))
      );
    } else {
      setReports((prev) => [{ id: uid(), ...form, status, createdAt: now, submittedAt: status === "submitted" ? now : undefined }, ...prev]);
    }
    showToast(status === "submitted" ? "提出済みにしました" : "下書きを保存しました");
    setEditingId(null);
    setView("list");
  };

  const deleteReport = (id) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
    setConfirmDelete(null);
    setDetailId(null);
    showToast("記録を削除しました", "info");
  };

  const markPaid = (id) => {
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status: "paid", paidAt: new Date().toISOString() } : r)));
    setDetailId(null);
    showToast("精算済みにしました");
  };

  const myReports = reports
    .filter((r) => statusFilter === "all" || r.status === statusFilter)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const stats = {
    submitted: reports.filter((r) => r.status === "submitted").length,
    paidTotal: itemsTotal(reports.filter((r) => r.status === "paid").flatMap((r) => r.items)),
  };

  /* ---------------- 画面描画 ---------------- */
  return (
    <div style={{ minHeight: "100vh", background: "#F0F4F8", fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", maxWidth: 480, margin: "0 auto", paddingBottom: 30 }}>
      {/* ヘッダー */}
      <div style={{ background: "linear-gradient(135deg,#1A2980 0%,#26D0CE 100%)", padding: "16px 18px 12px", color: "#fff", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>🧾 出張旅費精算</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>{currentUser.name}（{currentUser.dept}）</div>
          </div>
          <button onClick={() => setView("settings")} style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 20, padding: "5px 12px", color: "#fff", fontSize: 12, cursor: "pointer" }}>
            ⚙ 設定
          </button>
        </div>
      </div>

      {/* タブ */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #E2E8F0", position: "sticky", top: 68, zIndex: 99, overflowX: "auto" }}>
        {[
          { key: "list", label: "📋 一覧" },
          { key: "new", label: "＋ 新規記録" },
          { key: "excel", label: "📄 Excel出力" },
          { key: "settings", label: "⚙ 設定" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => (tab.key === "new" ? openNewForm() : setView(tab.key))}
            style={{
              flex: "1 0 auto",
              minWidth: 72,
              padding: "10px 4px",
              fontSize: 11,
              fontWeight: view === tab.key ? 700 : 400,
              color: view === tab.key ? "#1A2980" : "#718096",
              background: "none",
              border: "none",
              cursor: "pointer",
              borderBottom: view === tab.key ? "2px solid #1A2980" : "2px solid transparent",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 14 }}>
        {/* ---- 一覧 ---- */}
        {view === "list" && (
          <>
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
            {myReports.length === 0 ? (
              <div style={{ textAlign: "center", color: "#A0AEC0", padding: "60px 0", fontSize: 13 }}>
                記録はまだありません。
                <br />
                「＋ 新規記録」から出張精算を記録しましょう。
              </div>
            ) : (
              myReports.map((r) => <ReportCard key={r.id} report={r} onClick={() => setDetailId(r.id)} />)
            )}
          </>
        )}

        {/* ---- 新規/編集申請フォーム ---- */}
        {view === "new" && (
          <div>
            <div style={cardStyle}>
              <label style={labelStyle}>出張先</label>
              <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="例：大阪支店" value={form.destination} onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))} />
              <label style={labelStyle}>出張目的</label>
              <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="例：定例営業会議" value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} />
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>開始日</label>
                  <input type="date" style={inputStyle} value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>終了日</label>
                  <input type="date" style={inputStyle} value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#2D3748" }}>経費明細</span>
                <button onClick={autoAddPerDiem} style={{ fontSize: 11, background: "#EBF8FF", color: "#2B6CB0", border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>
                  💴 日当を自動追加
                </button>
              </div>

              {form.items.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {form.items.map((item) => (
                    <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #EDF2F7" }}>
                      <div>
                        <span style={{ fontSize: 12 }}>
                          {itemMeta(item.type).icon} {itemMeta(item.type).label}
                        </span>
                        <div style={{ fontSize: 13, color: "#2D3748" }}>{item.desc}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1A2980" }}>{fmtYen(item.amount)}</span>
                        <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: "#C53030", fontSize: 16, cursor: "pointer" }}>
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, fontWeight: 700 }}>
                    <span style={{ fontSize: 13, color: "#4A5568" }}>合計</span>
                    <span style={{ fontSize: 17, color: "#1A2980" }}>{fmtYen(itemsTotal(form.items))}</span>
                  </div>
                </div>
              )}

              <div style={{ background: "#F7FAFC", borderRadius: 10, padding: 10 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  {ITEM_TYPES.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setItemDraft((d) => ({ ...d, type: t.key }))}
                      style={{
                        fontSize: 11,
                        padding: "5px 10px",
                        borderRadius: 20,
                        border: itemDraft.type === t.key ? "1px solid #1A2980" : "1px solid #E2E8F0",
                        background: itemDraft.type === t.key ? "#1A2980" : "#fff",
                        color: itemDraft.type === t.key ? "#fff" : "#4A5568",
                        cursor: "pointer",
                      }}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                <input
                  style={{ ...inputStyle, marginBottom: 8, background: "#fff" }}
                  placeholder="内容（例：東京⇔大阪 新幹線）"
                  value={itemDraft.desc}
                  onChange={(e) => setItemDraft((d) => ({ ...d, desc: e.target.value }))}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number"
                    style={{ ...inputStyle, background: "#fff" }}
                    placeholder="金額"
                    value={itemDraft.amount}
                    onChange={(e) => setItemDraft((d) => ({ ...d, amount: e.target.value }))}
                  />
                  <button onClick={addItem} style={{ ...navBtn, background: "#1A2980", color: "#fff", border: "none", flexShrink: 0 }}>
                    追加
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button style={ghostBtn} onClick={() => saveReport("draft")}>
                下書き保存
              </button>
              <button style={primaryBtn} onClick={() => saveReport("submitted")}>
                提出する
              </button>
            </div>
          </div>
        )}

        {/* ---- Excel出力 ---- */}
        {view === "excel" && <ExcelExportView currentUser={currentUser} showToast={showToast} />}

        {/* ---- 設定 ---- */}
        {view === "settings" && (
          <>
            <div style={cardStyle}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "#2D3748" }}>プロフィール</div>
              <label style={labelStyle}>氏名</label>
              <input
                style={{ ...inputStyle, marginBottom: 10 }}
                value={currentUser.name}
                onChange={(e) => setCurrentUser((u) => ({ ...u, name: e.target.value }))}
              />
              <label style={labelStyle}>部署</label>
              <input style={inputStyle} value={currentUser.dept} onChange={(e) => setCurrentUser((u) => ({ ...u, dept: e.target.value }))} />
            </div>

            <div style={cardStyle}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "#2D3748" }}>日当単価</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="number"
                  style={inputStyle}
                  value={perDiemRate}
                  onChange={(e) => setPerDiemRate(Number(e.target.value) || 0)}
                />
                <span style={{ fontSize: 13, color: "#718096", flexShrink: 0 }}>円 ／ 日</span>
              </div>
              <div style={{ fontSize: 11, color: "#A0AEC0", marginTop: 6 }}>「日当を自動追加」ボタンで使用される単価です。</div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "#2D3748" }}>サマリー</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #EDF2F7" }}>
                <span style={{ color: "#718096" }}>提出済み（精算待ち）</span>
                <span style={{ fontWeight: 700 }}>{stats.submitted} 件</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0" }}>
                <span style={{ color: "#718096" }}>精算済み合計</span>
                <span style={{ fontWeight: 700, color: "#1A2980" }}>{fmtYen(stats.paidTotal)}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ---- 詳細モーダル ---- */}
      {detailReport && (
        <div style={overlay} onClick={() => setDetailId(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3748" }}>{detailReport.destination}</div>
                <div style={{ fontSize: 12, color: "#718096", marginTop: 2 }}>
                  {fmtDate(detailReport.startDate)} 〜 {fmtDate(detailReport.endDate)}（{daysBetween(detailReport.startDate, detailReport.endDate)}日間）
                </div>
              </div>
              <StatusBadge status={detailReport.status} />
            </div>
            {detailReport.purpose && <div style={{ fontSize: 13, color: "#4A5568", background: "#F7FAFC", borderRadius: 8, padding: 8, marginBottom: 12 }}>{detailReport.purpose}</div>}

            <div style={{ fontSize: 13, fontWeight: 700, color: "#2D3748", marginBottom: 6 }}>経費明細</div>
            {detailReport.items.map((item) => (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #EDF2F7" }}>
                <span style={{ fontSize: 13, color: "#4A5568" }}>
                  {itemMeta(item.type).icon} {item.desc}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{fmtYen(item.amount)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontWeight: 700 }}>
              <span style={{ color: "#4A5568" }}>合計金額</span>
              <span style={{ fontSize: 18, color: "#1A2980" }}>{fmtYen(itemsTotal(detailReport.items))}</span>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button style={ghostBtn} onClick={() => setConfirmDelete(detailReport.id)}>
                削除
              </button>
              {detailReport.status !== "paid" && (
                <button style={primaryBtn} onClick={() => openEditForm(detailReport)}>
                  編集する
                </button>
              )}
            </div>

            {detailReport.status === "submitted" && (
              <button style={{ ...primaryBtn, marginTop: 10 }} onClick={() => markPaid(detailReport.id)}>
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
              <button style={{ ...primaryBtn, background: "#C53030" }} onClick={() => deleteReport(confirmDelete)}>
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
