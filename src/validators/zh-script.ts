/**
 * Common Simplified-only Chinese characters, grouped by radical/family. Each entry
 * is a glyph whose Traditional form differs (e.g. 国 → 國), so its presence in a
 * zh-Hant translation signals Simplified leakage. Used by the script_consistency
 * validator. Curated, not exhaustive — it catches the high-frequency cases that
 * actually leak; grows as reviewers report misses. (A future hardening could swap
 * this for an OpenCC-based conversion check.)
 */
const GROUPS: string[] = [
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
// 丰采, 参 in some readings) are deliberately EXCLUDED — this is a blocking
// validator, so a false positive would wrongly fail correct Traditional text.
// Better to under-flag (a missed Simplified char gets caught by the critic /
// human) than to over-flag.

export const SIMPLIFIED_ONLY: ReadonlySet<string> = new Set(GROUPS.join("").split(""));
