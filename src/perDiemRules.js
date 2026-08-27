/**
 * 出張手当規定（国 × 役職区分でテーブル化）。
 * 国・区分が増えても、このテーブルに追記するだけで対応できるようにする。
 */
export const PER_DIEM_RULES = {
  japan: {
    label: "日本",
    general: {
      label: "一般社員",
      currency: "JPY",
      // 出発日：フライトの出発時刻で判定
      departureBrackets: [
        { from: "00:00", to: "08:59", amount: 4000 }, // 中日及び早朝
        { from: "09:00", to: "12:59", amount: 2400 }, // 午前
        { from: "13:00", to: "23:59", amount: 1600 }, // 午後
      ],
      // 帰着日：フライトの到着時刻で判定
      returnBrackets: [
        { from: "00:00", to: "12:59", amount: 0 }, // 午前
        { from: "13:00", to: "17:59", amount: 1600 }, // 午後
        { from: "18:00", to: "23:59", amount: 4000 }, // 午後（夜）
      ],
      middleDayAmount: 4000, // 中日（現地フル在勤日）
    },
  },
  korea: {
    label: "韓国",
    general: {
      label: "一般社員",
      currency: "USD",
      fullDayAmount: 45, // 満日
      travelDayAmount: 18, // 移動日（出発日・帰着日）
    },
  },
};

const timeToMinutes = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const inBracket = (time, bracket) => {
  const t = timeToMinutes(time);
  return t >= timeToMinutes(bracket.from) && t <= timeToMinutes(bracket.to);
};

export function lookupBracketAmount(time, brackets) {
  const b = brackets.find((br) => inBracket(time, br));
  return b ? b.amount : 0;
}

export const isWeekend = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  return day === 0 || day === 6;
};

export const dateRange = (start, end) => {
  const out = [];
  if (!start || !end || start > end) return out;
  let d = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (d <= last) {
    out.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return out;
};

/**
 * 日本出張の日別手当を規定表に基づいて自動計算する。
 * departureTime / arrivalTime は "HH:MM"。未入力なら出発日=中日扱い、帰着日=0円とする。
 * excludeWeekend が true の場合、土日は手当0円（規定の趣旨：休日自宅宿泊は日当なし）。
 * 返り値は日ごとの { date, amount, currency, note, isWeekend }。
 */
export function calcJapanDailyAllowances({ startDate, endDate, departureTime, arrivalTime, excludeWeekend, rank = "general" }) {
  const rule = PER_DIEM_RULES.japan[rank] || PER_DIEM_RULES.japan.general;
  const dates = dateRange(startDate, endDate);
  return dates.map((date, i) => {
    const weekend = isWeekend(date);
    const isDeparture = i === 0;
    const isReturn = i === dates.length - 1 && dates.length > 1;
    let amount;
    let note;
    if (isDeparture) {
      amount = departureTime ? lookupBracketAmount(departureTime, rule.departureBrackets) : rule.middleDayAmount;
      note = departureTime ? `出発日（出発${departureTime}）` : "出発日";
    } else if (isReturn) {
      amount = arrivalTime ? lookupBracketAmount(arrivalTime, rule.returnBrackets) : 0;
      note = arrivalTime ? `帰着日（到着${arrivalTime}）` : "帰着日";
    } else {
      amount = rule.middleDayAmount;
      note = "中日";
    }
    if (weekend && excludeWeekend) {
      note += "／土日のため手当対象外";
      amount = 0;
    }
    return { date, amount, currency: rule.currency, note, isWeekend: weekend, isDeparture, isReturn };
  });
}

/**
 * 韓国出張の日別手当（USD建て・日数ベース）。移動日（出発日・帰着日）は
 * travelDayAmount、それ以外の満日は fullDayAmount。
 */
export function calcKoreaDailyAllowances({ startDate, endDate, excludeWeekend, rank = "general" }) {
  const rule = PER_DIEM_RULES.korea[rank] || PER_DIEM_RULES.korea.general;
  const dates = dateRange(startDate, endDate);
  return dates.map((date, i) => {
    const weekend = isWeekend(date);
    const isDeparture = i === 0;
    const isReturn = i === dates.length - 1 && dates.length > 1;
    const isTravelDay = isDeparture || isReturn;
    let amount = isTravelDay ? rule.travelDayAmount : rule.fullDayAmount;
    let note = isTravelDay ? "移動日" : "満日";
    if (weekend && excludeWeekend) {
      note += "／土日のため手当対象外";
      amount = 0;
    }
    return { date, amount, currency: rule.currency, note, isWeekend: weekend, isDeparture, isReturn };
  });
}
