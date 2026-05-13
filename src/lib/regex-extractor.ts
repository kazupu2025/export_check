import { kanjiToNumber } from './kanji-number';

// ===== 単位辞書 =====
const UNIT_MAP: { pattern: RegExp; unit: string }[] = [
  { pattern: /キログラム/, unit: 'kg' },
  { pattern: /グラム/, unit: 'g' },
  { pattern: /トン(?!ネル|数)/, unit: 't' },
  { pattern: /立方メートル|㎥|m³/, unit: 'm³' },
  { pattern: /平方メートル|㎡|m²/, unit: 'm²' },
  { pattern: /メートル(?!毎秒|毎時|パー)/, unit: 'm' },
  { pattern: /メートル毎秒|m\/s/, unit: 'm/s' },
  { pattern: /テスラ|T(?=\b)/, unit: 'T' },
  { pattern: /ボルト(?!アンペア)/, unit: 'V' },
  { pattern: /アンペア(?!毎)/, unit: 'A' },
  { pattern: /ヘルツ|Hz/, unit: 'Hz' },
  { pattern: /ギガヘルツ|GHz/, unit: 'GHz' },
  { pattern: /メガヘルツ|MHz/, unit: 'MHz' },
  { pattern: /ケルビン/, unit: 'K' },
  { pattern: /グレイ/, unit: 'Gy' },
  { pattern: /ワット(?!時)/, unit: 'W' },
  { pattern: /ジュール/, unit: 'J' },
  { pattern: /パスカル|Pa(?=\b)/, unit: 'Pa' },
  { pattern: /ギガパスカル|GPa/, unit: 'GPa' },
  { pattern: /ニュートン/, unit: 'N' },
  { pattern: /パーセント|％|%/, unit: '%' },
  { pattern: /秒(?!速|間)/, unit: 's' },
  { pattern: /リットル/, unit: 'L' },
  { pattern: /ミリメートル|mm/, unit: 'mm' },
  { pattern: /マイクロメートル|μm/, unit: 'μm' },
  { pattern: /デシベル|dB/, unit: 'dB' },
  { pattern: /度(?=の温度|Ｃ|C|を超|以上|以下|未満)/, unit: '℃' },
];

// ===== 閾値演算子辞書 =====
const OP_MAP: { pattern: RegExp; op: string; display: string }[] = [
  { pattern: /以上/, op: '>=', display: '以上' },
  { pattern: /を超え(?:る)?|超過/, op: '>', display: 'を超える' },
  { pattern: /超(?:え)?(?=る|て|\s|$)/, op: '>', display: 'を超える' },
  { pattern: /以下/, op: '<=', display: '以下' },
  { pattern: /未満/, op: '<', display: '未満' },
];

// ===== 材料・品目キーワード =====
const MATERIAL_KEYWORDS = [
  'ガラス繊維', '炭素繊維', 'アラミド繊維', 'ポリエチレン繊維',
  '無機繊維', '有機繊維',
  '人造黒鉛', '黒鉛', '炭素炭素複合材料', '複合材料',
  'チタン合金', 'アルミニウム合金', 'マグネシウム合金', 'ニッケル合金', 'マルエージング鋼',
  'タングステン', 'モリブデン', 'レニウム',
  '超電導', '超伝導',
  'フッ素', 'ふっ素',
  '化学製剤', '爆発物', '火工品',
  '工作機械', '旋盤', 'マシニングセンタ',
  '電子計算機', 'コンピュータ',
  'レーザー', 'レーザ',
  '半導体', '集積回路',
  '無人航空機', '航空機', '宇宙飛翔体',
  '潜水艦', '艦船',
  '化学兵器', '生物兵器', '核兵器',
  '核燃料', 'ウラン', 'プルトニウム',
];

// ===== パラメータ名辞書（「Xが NUMBER UNIT OP」の X 部分に対応） =====
// 重要: lookupParameter は lastIndexOf で「最近接」のものを返す。上位に置く必要なし
const PARAMETER_MAP: { ja: string; en: string }[] = [
  // 繊維・複合材料（主要パラメータ）
  { ja: '比弾性率', en: 'specific_modulus' },
  { ja: '比強度', en: 'specific_strength' },
  { ja: '比引張強さ', en: 'specific_tensile_strength' },
  { ja: '引張強さ', en: 'tensile_strength' },
  { ja: '引張り強さ', en: 'tensile_strength' },
  { ja: '引張強度', en: 'tensile_strength' },
  { ja: '圧縮強度', en: 'compressive_strength' },
  // 熱的特性
  { ja: '融点', en: 'melting_point' },
  { ja: '軟化点', en: 'softening_point' },
  { ja: '分解点', en: 'decomposition_point' },
  { ja: '昇華温度', en: 'sublimation_temperature' },
  { ja: '沸点', en: 'boiling_point' },
  { ja: '温度', en: 'temperature' },
  // 組成・濃度
  { ja: '含有量', en: 'content_ratio' },
  { ja: '純度', en: 'purity' },
  // 物性
  { ja: '見掛け比重', en: 'apparent_specific_gravity' },
  { ja: '密度', en: 'density' },
  { ja: '比重', en: 'specific_gravity' },
  { ja: '粒径', en: 'particle_size' },
  { ja: '熱伝導率', en: 'thermal_conductivity' },
  // 寸法（成型品の外形制約。材料特性ではないため分類時に区別可能）
  { ja: '外径', en: 'outer_diameter' },
  { ja: '内径', en: 'inner_diameter' },
  { ja: '厚さ', en: 'thickness' },
  { ja: '幅', en: 'width' },
  // 電気・電磁
  { ja: '磁束密度', en: 'magnetic_flux_density' },
  { ja: '周波数', en: 'frequency' },
  { ja: '出力', en: 'output_power' },
  { ja: '電力', en: 'power' },
  { ja: '電流', en: 'current' },
  { ja: '電圧', en: 'voltage' },
  // その他
  { ja: '製造能力', en: 'production_capacity' },
  { ja: '容量', en: 'volume_capacity' },
  { ja: '質量', en: 'mass' },
  { ja: '重量', en: 'weight' },
  { ja: '輝度', en: 'luminance' },
  { ja: '速度', en: 'velocity' },
  { ja: '加速度', en: 'acceleration' },
  { ja: '圧力', en: 'pressure' },
  { ja: '透過率', en: 'transmittance' },
  { ja: '吸収線量', en: 'absorbed_dose' },
  { ja: 'ほう素当量', en: 'boron_equivalent' },
  { ja: '軸数', en: 'axis_count' },
];

// パラメータごとに許容される単位セット（これ以外の単位が来たら抽出ミスとして除去）
const VALID_UNITS: Record<string, string[]> = {
  '比弾性率':   ['m'],
  '比強度':     ['m'],
  '比引張強さ': ['m'],
  '融点':       ['℃', 'K'],
  '軟化点':     ['℃', 'K'],
  '分解点':     ['℃', 'K'],
  '昇華温度':   ['℃', 'K'],
  '温度':       ['℃', 'K', '℃'],
  '引張強さ':   ['Pa', 'MPa', 'GPa', 'N', 'kN', 'MN'],
  '圧縮強度':   ['Pa', 'MPa', 'GPa'],
  '外径':       ['mm', 'm', 'μm'],
  '内径':       ['mm', 'm', 'μm'],
  '厚さ':       ['mm', 'm', 'μm'],
  '幅':         ['mm', 'm', 'μm'],
  '含有量':     ['%'],
  '純度':       ['%'],
};

function isValidUnitForParam(parameter_ja: string, unit: string): boolean {
  const allowed = VALID_UNITS[parameter_ja];
  if (!allowed) return true; // バリデーション定義なし → 許容
  return allowed.includes(unit);
}

export interface RegexThreshold {
  parameter_ja: string;
  parameter_en: string | null;
  unit: string;
  threshold_value: number;
  threshold_op: string;
  display_expr: string;
  material_tags: string[];
  condition_group: number;
  condition_conjunction: string;
}

// 漢数字 + 単位 + 演算子 のパターンを検索
const NUMBER_CHARS = '[〇一二三四五六七八九０-９0-9][〇一二三四五六七八九０-９0-9、,・.．]*';

function detectUnit(text: string): { unit: string; length: number } | null {
  for (const { pattern, unit } of UNIT_MAP) {
    const m = text.match(new RegExp(`^[\\s　]*(${pattern.source})`));
    if (m) return { unit, length: m[0].length };
  }
  return null;
}

function detectOp(text: string): { op: string; display: string; length: number } | null {
  for (const { pattern, op, display } of OP_MAP) {
    const m = text.match(new RegExp(`^[\\s　]*(${pattern.source})`));
    if (m) return { op, display, length: m[0].length };
  }
  return null;
}

function lookupParameter(text: string, endIdx: number): { ja: string; en: string } {
  // Step1: 直前20字で「Xが」パターン（例:「外径が」「比弾性率が」）を最優先
  // 「X度の温度において Y mm」のような条件節を誤認識しないための近接チェック
  const nearWindow = text.slice(Math.max(0, endIdx - 20), endIdx);
  const gaIdx = nearWindow.lastIndexOf('が');
  if (gaIdx > 0) {
    const beforeGa = nearWindow.slice(0, gaIdx);
    for (const param of PARAMETER_MAP) {
      if (beforeGa.endsWith(param.ja)) return param;
    }
  }

  // Step2: 直前100字でlastIndexOf最近接
  const windowStart = Math.max(0, endIdx - 100);
  const before = text.slice(windowStart, endIdx);
  let bestParam = { ja: '（数値条件）', en: '' };
  let bestIdx = -1;
  for (const param of PARAMETER_MAP) {
    const idx = before.lastIndexOf(param.ja);
    if (idx > bestIdx) {
      bestIdx = idx;
      bestParam = param;
    }
  }
  return bestParam;
}

function extractMaterialTags(text: string): string[] {
  return MATERIAL_KEYWORDS.filter((kw) => text.includes(kw));
}

// 2段階ウィンドウ: まず100字を探し、見つからなければ400字に拡張
// → 近い閾値は汚染防止、遠い閾値（融点など）もカバー
function extractMaterialTagsForMatch(
  fullText: string,
  matchIndex: number,
  matchEnd: number
): string[] {
  const narrowStart = Math.max(0, matchIndex - 100);
  const narrowTags = extractMaterialTags(fullText.slice(narrowStart, matchEnd));
  if (narrowTags.length > 0) return narrowTags;

  const wideStart = Math.max(0, matchIndex - 400);
  return extractMaterialTags(fullText.slice(wideStart, matchEnd));
}

export function extractThresholdsFromText(fullText: string): RegexThreshold[] {
  const results: RegexThreshold[] = [];
  const numberRegex = new RegExp(NUMBER_CHARS, 'g');
  let conditionGroup = 0;
  let lastMatchEnd = -1;

  let match: RegExpExecArray | null;
  while ((match = numberRegex.exec(fullText)) !== null) {
    const numStr = match[0];
    const numValue = kanjiToNumber(numStr);
    if (numValue === null) continue;

    const after = fullText.slice(match.index + numStr.length);

    // 単位（省略可）
    const unitMatch = detectUnit(after);
    const unitLen = unitMatch?.length ?? 0;
    const unit = unitMatch?.unit ?? '（単位不明）';

    // 演算子
    const afterUnit = after.slice(unitLen);
    const opMatch = detectOp(afterUnit);
    if (!opMatch) continue;

    const displayExpr = `${numStr}${unitMatch ? after.slice(0, unitLen).trim() : ''}${afterUnit.slice(0, opMatch.length).trim()}`;
    const param = lookupParameter(fullText, match.index);

    // 「又は」があれば同一グループ、それ以外は新グループ
    const gap = fullText.slice(Math.max(0, lastMatchEnd), match.index);
    if (gap.includes('又は') || gap.includes('もしくは') || gap.includes('若しくは')) {
      // same group, OR
    } else if (lastMatchEnd > 0) {
      conditionGroup++;
    }
    lastMatchEnd = match.index + numStr.length + unitLen + opMatch.length;

    // パラメータ×単位が意味的に矛盾する場合（例: 温度/mm）はスキップ
    if (!isValidUnitForParam(param.ja, unit)) continue;

    results.push({
      parameter_ja: param.ja,
      parameter_en: param.en || null,
      unit,
      threshold_value: numValue,
      threshold_op: opMatch.op,
      display_expr: displayExpr,
      material_tags: extractMaterialTagsForMatch(fullText, match.index, lastMatchEnd),
      condition_group: conditionGroup,
      condition_conjunction: gap.includes('又は') || gap.includes('もしくは') ? 'OR' : 'AND',
    });
  }

  return results;
}
