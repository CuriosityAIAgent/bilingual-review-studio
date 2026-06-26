/**
 * Wrong-script character sets for the script_consistency validator. Each glyph is
 * one whose counterpart in the other script differs (e.g. 国 ↔ 國), so its presence
 * signals script leakage:
 *   - SIMPLIFIED_ONLY  → flagged in a Traditional (zh-Hant) target
 *   - TRADITIONAL_ONLY → flagged in a Simplified (zh-Hans) target
 * Curated, not exhaustive — catches the high-frequency cases that actually leak;
 * grows as reviewers report misses. A future hardening could swap these hand sets
 * for an OpenCC-based conversion check.
 */
const SIMPLIFIED_GROUPS: string[] = [
  "们个会众优体价伟传伤俭储仅从仓仪", // 亻 person
  "国图团园围圆区医县压厌厦", // 囗 enclosure / 厂 (omit 参: ambiguous reading)
  "贝财货贸费贷购资质贫贵贴贪赚账赞赛", // 貝 money/shell
  "银钱钟铁错镇锁链销锐铜铺", // 釒 metal
  "红约级纪纸织统综纳纷线终维续结给经绝绍绿缩", // 糹 silk
  "门问间闭闯闲闷阅阔", // 門 gate
  "见观览觉规视", // 見 see
  "页顶顺须顾顿预领颁频颜题颗额", // 頁 page
  "让认识说话语读课谁译词试论议讲记设访评误请谢谈调证该", // 訁 speech
  "这进远连适选运边过还违迟递逻", // 辶 walk
  "马驱驶验骑骆骄", // 馬 horse
  "鸟鸡鸣鸭鸿鱼鲜", // 鳥/魚 bird/fish
  "车转轮输较辆轨软轻", // 車 vehicle
  "东长书买卖单双发变对开关为临严亚", // common (omit 乐/丰: 丰 is valid Traditional 丰采)
  "应实际时华协历习网络计机电脑项数据亿", // common / tech (omit 万: also a Traditional surname/variant)
];

// NOTE: characters that are ALSO valid standard Traditional (e.g. 万 surname, 丰
// 丰采, 参 in some readings) are deliberately EXCLUDED from SIMPLIFIED_GROUPS —
// this is a blocking validator, so a false positive would wrongly fail correct
// Traditional text. Better to under-flag than over-flag.

// Traditional-only forms — the partner glyphs. Their presence in a Simplified
// (zh-Hans) document is always wrong (Simplified uses 万/乐/丰/参/etc.), so the
// 4 excluded above are safe to include HERE.
const TRADITIONAL_GROUPS: string[] = [
  "們個會眾優體價偉傳傷儉儲僅從倉儀", // 亻 person
  "國圖團園圍圓區醫縣壓厭廈參", // 囗 enclosure / 厂
  "貝財貨貿費貸購資質貧貴貼貪賺賬贊賽", // 貝 money/shell
  "銀錢鐘鐵錯鎮鎖鏈銷銳銅鋪", // 釒 metal
  "紅約級紀紙織統綜納紛線終維續結給經絕紹綠縮", // 糹 silk
  "門問間閉闖閒悶閱闊", // 門 gate
  "見觀覽覺規視", // 見 see
  "頁頂順須顧頓預領頒頻顏題顆額", // 頁 page
  "讓認識說話語讀課誰譯詞試論議講記設訪評誤請謝談調證該", // 訁 speech
  "這進遠連適選運邊過還違遲遞邏", // 辶 walk
  "馬驅駛驗騎駱驕", // 馬 horse
  "鳥雞鳴鴨鴻魚鮮", // 鳥/魚 bird/fish
  "車轉輪輸較輛軌軟輕", // 車 vehicle
  "東長書買賣單雙發變對開關為臨嚴亞萬樂豐", // common
  "應實際時華協歷習網絡計機電腦項數據億", // common / tech
];

export const SIMPLIFIED_ONLY: ReadonlySet<string> = new Set(SIMPLIFIED_GROUPS.join("").split(""));
export const TRADITIONAL_ONLY: ReadonlySet<string> = new Set(TRADITIONAL_GROUPS.join("").split(""));
