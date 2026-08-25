/**
 * 都市名の表記正規化。英語表記でOCR/入力された場合に、日本語表記
 * （日本・中国・韓国等の漢字文化圏は漢字、それ以外はカタカナ）へ
 * 変換する。辞書にない都市名はそのまま返す（利用者が手動修正する前提）。
 */
const CITY_NAME_MAP = {
  // 日本（漢字）
  osaka: "大阪",
  tokyo: "東京",
  kyoto: "京都",
  nagoya: "名古屋",
  fukuoka: "福岡",
  sapporo: "札幌",
  gifu: "岐阜",
  kobe: "神戸",
  yokohama: "横浜",
  nagasaki: "長崎",
  sendai: "仙台",
  hiroshima: "広島",
  okinawa: "沖縄",
  naha: "那覇",
  niigata: "新潟",
  kanazawa: "金沢",
  // 中国・台湾・香港（漢字）
  shanghai: "上海",
  beijing: "北京",
  guangzhou: "広州",
  shenzhen: "深圳",
  hangzhou: "杭州",
  chengdu: "成都",
  taipei: "台北",
  "hong kong": "香港",
  hongkong: "香港",
  // 韓国（カタカナ）
  seoul: "ソウル",
  busan: "プサン",
  // 東南アジア・その他アジア（カタカナ）
  bangkok: "バンコク",
  singapore: "シンガポール",
  "kuala lumpur": "クアラルンプール",
  manila: "マニラ",
  jakarta: "ジャカルタ",
  hanoi: "ハノイ",
  "ho chi minh city": "ホーチミン",
  mumbai: "ムンバイ",
  delhi: "デリー",
  // ヨーロッパ（カタカナ）
  paris: "パリ",
  london: "ロンドン",
  rome: "ローマ",
  milan: "ミラノ",
  berlin: "ベルリン",
  frankfurt: "フランクフルト",
  munich: "ミュンヘン",
  madrid: "マドリード",
  barcelona: "バルセロナ",
  amsterdam: "アムステルダム",
  vienna: "ウィーン",
  zurich: "チューリッヒ",
  geneva: "ジュネーブ",
  brussels: "ブリュッセル",
  // 北米（カタカナ）
  "new york": "ニューヨーク",
  "los angeles": "ロサンゼルス",
  "san francisco": "サンフランシスコ",
  chicago: "シカゴ",
  toronto: "トロント",
  vancouver: "バンクーバー",
  // オセアニア（カタカナ）
  sydney: "シドニー",
  melbourne: "メルボルン",
  auckland: "オークランド",
};

export function normalizeCityName(text) {
  const key = String(text || "").trim().toLowerCase();
  if (!key) return text || "";
  return CITY_NAME_MAP[key] || text;
}
