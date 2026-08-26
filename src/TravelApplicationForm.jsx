import { useState } from "react";
import { cardStyle, labelStyle, inputStyle, primaryBtn } from "./styles.js";
import ReceiptUpload from "./ReceiptUpload.jsx";
import { recognizeFlightNumber, recognizeRoundTripFlight, recognizeHotel } from "./receiptOcr.js";
import { normalizeCityName } from "./cityNames.js";
import { generateTravelApplicationExcel, downloadExcelBuffer, HOTEL_ROW_CAPACITY } from "./travelApplicationTemplate.js";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayStr = () => new Date().toISOString().split("T")[0];

const emptyStay = () => ({ city: "", checkIn: "", checkOut: "", hotelName: "", tel: "", fax: "", address: "" });

const smallBtn = { background: "#1A2980", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer", flexShrink: 0 };
const miniInput = { ...inputStyle, background: "#fff", fontSize: 13, padding: "8px 10px" };
const sectionTitle = { fontWeight: 700, fontSize: 14, color: "#2D3748", marginBottom: 4 };
const helpText = { fontSize: 11, color: "#A0AEC0", marginBottom: 10 };

function EntryList({ entries, onRemove, render }) {
  if (entries.length === 0) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      {entries.map((e) => (
        <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #EDF2F7" }}>
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
 * 出張申請書（国外出差日程表）を生成するフォーム。氏名・护照号码・
 * E-Mail等の固定項目はプロフィール（設定タブ）から取得し、ここでの
 * 二重入力は行わない。
 */
export default function TravelApplicationForm({ profile, showToast, onOpenSettings }) {
  const [country, setCountry] = useState("");
  const [departureDate, setDepartureDate] = useState(todayStr());
  const [returnDate, setReturnDate] = useState(todayStr());
  const [outboundFlight, setOutboundFlight] = useState("");
  const [transitFlight, setTransitFlight] = useState("");
  const [returnFlight, setReturnFlight] = useState("");
  const [stays, setStays] = useState([]);
  const [stayDraft, setStayDraft] = useState(emptyStay());
  const [generating, setGenerating] = useState(false);

  const addStay = () => {
    if (!stayDraft.city.trim() || !stayDraft.hotelName.trim()) {
      showToast("城市とホテル名を入力してください", "error");
      return;
    }
    if (stays.length >= HOTEL_ROW_CAPACITY) {
      showToast(`宿泊は最大${HOTEL_ROW_CAPACITY}件までです`, "error");
      return;
    }
    setStays((s) => [...s, { id: uid(), ...stayDraft }]);
    setStayDraft(emptyStay());
  };
  const removeStay = (id) => setStays((s) => s.filter((x) => x.id !== id));

  const missingProfileFields = [
    !profile.name && "氏名",
    !profile.passportNo && "护照号码",
    !profile.email && "E-Mail",
    !profile.overseasMobile && "海外手机号码",
    !profile.emergencyContact && "国内紧急联络人",
  ].filter(Boolean);

  const handleGenerate = async () => {
    if (!profile.name) {
      showToast("設定画面で氏名を入力してください", "error");
      return;
    }
    if (!country.trim()) {
      showToast("出差地点（国名）を入力してください", "error");
      return;
    }
    if (!departureDate || !returnDate) {
      showToast("出発日・帰国日を入力してください", "error");
      return;
    }
    setGenerating(true);
    try {
      const buffer = await generateTravelApplicationExcel({
        name: profile.name,
        passportNo: profile.passportNo,
        email: profile.email,
        overseasMobile: profile.overseasMobile,
        emergencyContact: profile.emergencyContact,
        country,
        outboundFlight,
        transitFlight,
        returnFlight,
        departureDate,
        returnDate,
        stays,
      });
      const place = stays[0]?.city || country;
      downloadExcelBuffer(buffer, `出張申請_${place}.xlsx`);
      showToast("出張申請書を生成しました");
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
          出発日・帰国日と、フライト／ホテルの予約画面をアップロードするだけで、社内様式「国外出差日程表」を生成します。
        </div>
      </div>

      <div style={cardStyle}>
        <div style={sectionTitle}>申請者情報（プロフィールから取得）</div>
        <div style={{ fontSize: 13, color: "#4A5568", lineHeight: 1.9 }}>
          <div>姓名：{profile.name || "未設定"}</div>
          <div>护照号码：{profile.passportNo || "未設定"}</div>
          <div>E-Mail：{profile.email || "未設定"}</div>
          <div>海外手机号码：{profile.overseasMobile || "未設定"}</div>
          <div>国内紧急联络人：{profile.emergencyContact || "未設定"}</div>
        </div>
        {missingProfileFields.length > 0 && (
          <div style={{ fontSize: 11, color: "#DD6B20", marginTop: 6 }}>
            未設定の項目があります（{missingProfileFields.join("・")}）。
          </div>
        )}
        <button type="button" onClick={onOpenSettings} style={{ ...smallBtn, width: "100%", marginTop: 8 }}>
          設定画面で編集する
        </button>
      </div>

      <div style={cardStyle}>
        <div style={sectionTitle}>出張概要</div>
        <label style={labelStyle}>出差地点（国名）</label>
        <input
          style={{ ...inputStyle, marginBottom: 10 }}
          placeholder="例：日本"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <span style={{ fontSize: 11, color: "#718096" }}>出発日</span>
            <input type="date" style={{ ...miniInput, marginTop: 3 }} value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
          </div>
          <div>
            <span style={{ fontSize: 11, color: "#718096" }}>帰国日</span>
            <input type="date" style={{ ...miniInput, marginTop: 3 }} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={sectionTitle}>フライト</div>
        <div style={helpText}>コードシェア便の場合は主便名のみが読み取られます（併記番号は使用しません）。</div>
        <ReceiptUpload
          label="📷 フライト画面から往復の便名をまとめて読み取る"
          showToast={showToast}
          recognize={recognizeRoundTripFlight}
          describeResult={(r) => [r.outboundFlight && `去程:${r.outboundFlight}`, r.returnFlight && `回程:${r.returnFlight}`].filter(Boolean).join("／") || null}
          onExtracted={(r) => {
            if (r.outboundFlight) setOutboundFlight(r.outboundFlight);
            if (r.returnFlight) setReturnFlight(r.returnFlight);
          }}
        />
        <div style={{ ...helpText, marginTop: 6 }}>去程・返程が1枚に写ったスクショなら、この1回のアップロードで両方の便名欄に自動入力されます。</div>

        <label style={{ ...labelStyle, marginTop: 6 }}>去程航班名称</label>
        <input style={{ ...inputStyle, marginBottom: 6 }} placeholder="例：MU225" value={outboundFlight} onChange={(e) => setOutboundFlight(e.target.value.toUpperCase())} />
        <ReceiptUpload
          label="📷 去程フライト画面のみから読み取る"
          showToast={showToast}
          recognize={recognizeFlightNumber}
          describeResult={(r) => (r.flightNumber ? `便名候補：${r.flightNumber}` : null)}
          onExtracted={(r) => r.flightNumber && setOutboundFlight(r.flightNumber)}
        />
        <label style={{ ...labelStyle, marginTop: 12 }}>中转航班名称（乗継がなければ空欄）</label>
        <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="例：CA1234" value={transitFlight} onChange={(e) => setTransitFlight(e.target.value.toUpperCase())} />
        <label style={labelStyle}>回程航班名称</label>
        <input style={{ ...inputStyle, marginBottom: 6 }} placeholder="例：MU730" value={returnFlight} onChange={(e) => setReturnFlight(e.target.value.toUpperCase())} />
        <ReceiptUpload
          label="📷 回程フライト画面のみから読み取る"
          showToast={showToast}
          recognize={recognizeFlightNumber}
          describeResult={(r) => (r.flightNumber ? `便名候補：${r.flightNumber}` : null)}
          onExtracted={(r) => r.flightNumber && setReturnFlight(r.flightNumber)}
        />
      </div>

      <div style={cardStyle}>
        <div style={sectionTitle}>ホテル（宿泊ごとに1件・最大{HOTEL_ROW_CAPACITY}件）</div>
        <div style={helpText}>電話番号はスクショに載っていないことが多いため、公式サイト等で店舗（支店）を確認のうえ入力してください。</div>
        <EntryList
          entries={stays}
          onRemove={removeStay}
          render={(s) => (
            <>
              <b>{s.city}</b>　{s.hotelName}
              <div style={{ color: "#718096" }}>
                {s.checkIn || "?"} 〜 {s.checkOut || "?"}　{s.tel}
              </div>
              {s.address && <div style={{ color: "#A0AEC0" }}>{s.address}</div>}
            </>
          )}
        />
        <div style={{ background: "#F7FAFC", borderRadius: 10, padding: 10 }}>
          <ReceiptUpload
            label="📷 ホテル予約画面から読み取る"
            showToast={showToast}
            recognize={recognizeHotel}
            describeResult={(r) => (r.hotelName ? `ホテル名候補：${r.hotelName}` : null)}
            onExtracted={(r) =>
              setStayDraft((d) => ({
                ...d,
                hotelName: r.hotelName || d.hotelName,
                checkIn: r.checkIn || d.checkIn,
                checkOut: r.checkOut || d.checkOut,
                tel: r.phone || d.tel,
              }))
            }
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6, marginTop: 8, marginBottom: 8 }}>
            <input
              style={miniInput}
              placeholder="城市（例：大阪）"
              value={stayDraft.city}
              onChange={(e) => setStayDraft((d) => ({ ...d, city: e.target.value }))}
              onBlur={(e) => setStayDraft((d) => ({ ...d, city: normalizeCityName(e.target.value) }))}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div>
                <span style={{ fontSize: 11, color: "#718096" }}>入住（チェックイン）</span>
                <input type="date" style={{ ...miniInput, marginTop: 3 }} value={stayDraft.checkIn} onChange={(e) => setStayDraft((d) => ({ ...d, checkIn: e.target.value }))} />
              </div>
              <div>
                <span style={{ fontSize: 11, color: "#718096" }}>离店（チェックアウト）</span>
                <input type="date" style={{ ...miniInput, marginTop: 3 }} value={stayDraft.checkOut} onChange={(e) => setStayDraft((d) => ({ ...d, checkOut: e.target.value }))} />
              </div>
            </div>
            <input style={miniInput} placeholder="酒店名称（日本語表記）" value={stayDraft.hotelName} onChange={(e) => setStayDraft((d) => ({ ...d, hotelName: e.target.value }))} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <input style={miniInput} placeholder="电话" value={stayDraft.tel} onChange={(e) => setStayDraft((d) => ({ ...d, tel: e.target.value }))} />
              <input style={miniInput} placeholder="传真（任意）" value={stayDraft.fax} onChange={(e) => setStayDraft((d) => ({ ...d, fax: e.target.value }))} />
            </div>
            <input style={miniInput} placeholder="地址" value={stayDraft.address} onChange={(e) => setStayDraft((d) => ({ ...d, address: e.target.value }))} />
          </div>
          <button onClick={addStay} style={{ ...smallBtn, width: "100%" }}>
            ＋ ホテルを追加
          </button>
        </div>
      </div>

      <button style={primaryBtn} onClick={handleGenerate} disabled={generating}>
        {generating ? "生成中..." : "📥 出張申請書をダウンロード（国外出差日程表）"}
      </button>
    </div>
  );
}
