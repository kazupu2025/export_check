import { createServerClient } from './supabase';

export interface RegulationThreshold {
  id: string;
  law_item_id: string;
  article_num: string;
  item_num: string;
  parameter_ja: string;
  parameter_en: string | null;
  unit: string;
  threshold_value: number;
  threshold_op: string;
  display_expr: string;
  material_tags: string[];
  condition_group: number;
  condition_conjunction: string;
  source_text: string;
}

export interface SpecInput {
  parameter_ja: string;
  parameter_en?: string;
  value: number;
  unit: string;
}

export interface ThresholdComparison {
  threshold: RegulationThreshold;
  userValue: number;
  exceeded: boolean;
  comparisonStr: string;
}

export interface ClassificationResult {
  verdict: '許可必要' | '非該当（許可不要）' | '要人間確認';
  reason: string;
  comparisons: ThresholdComparison[];
  matchedItems: string[];
}

function applyOp(value: number, op: string, threshold: number): boolean {
  switch (op) {
    case '>=': return value >= threshold;
    case '>':  return value > threshold;
    case '<=': return value <= threshold;
    case '<':  return value < threshold;
    case '==': return value === threshold;
    default:   return false;
  }
}

// ユーザー入力キーワード → 関連する法令分類語への展開マップ
// 法令は「無機繊維」と書くがユーザーは「ガラス繊維」と入力するため橋渡しが必要
// targetArticles フィルタが条文を分離するため、複合材料タグを追加しても
// fiber_material フォーム（第四条専用）にノイズは生じない
const KEYWORD_EXPANSION: Record<string, string[]> = {
  // 無機繊維系（第四条 fiber_material）
  'ガラス繊維':     ['ガラス繊維', '無機繊維'],
  'ガラス繊維織物': ['ガラス繊維', '無機繊維'],
  // 有機繊維系（第四条 fiber_material）
  'アラミド繊維':       ['アラミド繊維', '有機繊維'],
  'ポリエチレン繊維':   ['ポリエチレン繊維', '有機繊維'],
  // 複合材料系（第一条・第三条 shaped_article）
  // 部分一致で「複合材料成型品」「複合材料板」なども展開される
  '複合材料':           ['複合材料'],
  // FRP系（繊維素材としては母材タグ、成型品としては複合材料タグを追加）
  'CFRP':               ['炭素繊維', '複合材料'],
  'CFRPシート':         ['炭素繊維', '複合材料'],
  'GFRP':               ['ガラス繊維', '無機繊維', '複合材料'],
  'AFRP':               ['アラミド繊維', '有機繊維', '複合材料'],
  'FRP':                ['有機繊維', '無機繊維', '複合材料'],
  '繊維強化プラスチック':       ['有機繊維', '無機繊維', '複合材料'],
  '炭素繊維強化プラスチック':   ['炭素繊維', '複合材料'],
  'ガラス繊維強化プラスチック': ['ガラス繊維', '無機繊維', '複合材料'],
  // 工作機械系（DBの material_tags='工作機械' に対応）
  'マシニングセンタ':     ['工作機械'],
  '旋盤':               ['工作機械', '旋盤'],
  'NC工作機械':         ['工作機械'],
  '数値制御工作機械':   ['工作機械'],
  // レーザー系（DBの material_tags='レーザー' に対応）
  'レーザー発振器':   ['レーザー', 'レーザ'],
  'レーザ発振器':     ['レーザー', 'レーザ'],
  'レーザー装置':     ['レーザー', 'レーザ'],
};

function expandKeywords(keywords: string[]): string[] {
  const expanded = new Set<string>(keywords);
  for (const kw of keywords) {
    // 完全一致まず試す
    (KEYWORD_EXPANSION[kw] ?? []).forEach((x) => expanded.add(x));
    // 完全一致がなければ「ガラス繊維製品」→「ガラス繊維」を含むキーでもマッチ
    for (const [expansionKey, expansions] of Object.entries(KEYWORD_EXPANSION)) {
      if (kw.includes(expansionKey)) {
        expansions.forEach((x) => expanded.add(x));
      }
    }
  }
  return Array.from(expanded);
}

// 閾値の特異度を計算する（検索キーワードと一致するタグ数 / 総タグ数）
function calcSpecificity(tags: string[], expandedKeywords: string[]): number {
  const matchCount = tags.filter((tag) => expandedKeywords.includes(tag)).length;
  return matchCount / Math.max(tags.length, 1);
}

// フォームごとの最低特異度閾値（現在は全フォームで0 = フィルタなし）
// AND評価ロジックが材料の絞り込みを担うため、ここでの数値フィルタは不要
// 将来的に特定フォームで強化が必要になった場合に設定する
const FORM_MIN_SPECIFICITY: Record<string, number> = {};

// メイン判定関数
//
// 評価ロジック：
// - 同一 condition_group の閾値はすべてAND条件（1パス = 1グループ）
// - condition_group が異なれば法令上の別パス（別選択肢）= OR で評価
// - いずれかのグループで全条件が超過 → 許可必要
export async function classifyProduct(
  materialKeywords: string[],
  specs: SpecInput[],
  targetArticles: string[] = [],
  formId: string = ''
): Promise<ClassificationResult> {
  const db = createServerClient();
  const specMap = new Map(specs.map((s) => [s.parameter_ja, s.value]));
  if (specs.some((s) => s.parameter_en)) {
    specs.forEach((s) => { if (s.parameter_en) specMap.set(s.parameter_en, s.value); });
  }

  const expandedKeywords = expandKeywords(materialKeywords);
  const formExcluded = FORM_EXCLUDED_PARAMS[formId] ?? new Set<string>();
  const minSpecificity = FORM_MIN_SPECIFICITY[formId] ?? 0;

  // 材料タグ × 対象条文でDB側フィルタ
  let thresholdQuery = db
    .from('regulation_thresholds')
    .select('*')
    .overlaps('material_tags', expandedKeywords);
  if (targetArticles.length > 0) {
    thresholdQuery = thresholdQuery.in('article_num', targetArticles);
  }
  const { data: allThresholds } = await thresholdQuery
    .order('article_num')
    .order('item_num')
    .order('condition_group');

  // 特異度フィルタを適用（フォーム除外パラメータは評価対象のまま残す）
  // 除外パラメータを評価から外すと、同グループの他条件だけで超過判定されfalse positiveが生じる
  // 除外パラメータの userValue は undefined → groupAllExceeded=false になるため評価に含めても安全
  const thresholds = (allThresholds ?? []).filter((t) => {
    const tags = t.material_tags as string[];
    return calcSpecificity(tags, expandedKeywords) > minSpecificity;
  });

  if (thresholds.length === 0) {
    return {
      verdict: '要人間確認',
      reason: '関連する規制閾値が見つかりませんでした。CISTECへの確認を推奨します。',
      comparisons: [],
      matchedItems: [],
    };
  }

  // law_item_idごとにグループ化
  const byItem = new Map<string, RegulationThreshold[]>();
  for (const t of thresholds) {
    const key = `${t.article_num}__${t.item_num}`;
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key)!.push(t);
  }

  const allComparisons: ThresholdComparison[] = [];
  const matchedItems: string[] = [];
  let anyExceeded = false;
  let anyCompared = false;

  for (const [itemKey, itemThresholds] of byItem.entries()) {
    // condition_groupごとにグループ化
    // 各 condition_group は法令上の1パス（AND条件の塊）を表す
    // グループ間は OR（いずれかが全条件を満たせば規制対象）
    const byGroup = new Map<number, RegulationThreshold[]>();
    for (const t of itemThresholds) {
      if (!byGroup.has(t.condition_group)) byGroup.set(t.condition_group, []);
      byGroup.get(t.condition_group)!.push(t);
    }

    let itemExceeded = false;
    for (const groupThresholds of byGroup.values()) {
      // 同一 condition_group の全条件をAND評価
      // 入力値がない条件はスキップ（欠落 = このグループは「確認不能」 = exceeded扱いしない）
      let groupAllExceeded = true;
      let groupHasComparison = false;
      const groupComparisons: ThresholdComparison[] = [];

      for (const t of groupThresholds) {
        const userValue = specMap.get(t.parameter_ja) ?? specMap.get(t.parameter_en ?? '');
        if (userValue === undefined) {
          groupAllExceeded = false; // 未入力 = 全条件確認できない → 超過判定しない
          continue;
        }
        const exceeded = applyOp(userValue, t.threshold_op, t.threshold_value);
        groupComparisons.push({
          threshold: t,
          userValue,
          exceeded,
          comparisonStr: `${userValue} ${t.unit} ${exceeded ? '✓' : '✗'} (閾値: ${t.display_expr})`,
        });
        groupHasComparison = true;
        if (!exceeded) groupAllExceeded = false;
      }

      if (groupHasComparison) {
        anyCompared = true;
        allComparisons.push(...groupComparisons);
        if (groupAllExceeded) itemExceeded = true;
      }
    }

    if (itemExceeded) {
      anyExceeded = true;
      const [articleNum, itemNum] = itemKey.split('__');
      matchedItems.push(`${articleNum} ${itemNum}`);
    }
  }

  if (!anyCompared) {
    return {
      verdict: '要人間確認',
      reason: '入力されたパラメータと閾値が一致するものが見つかりません。追加情報が必要です。',
      comparisons: [],
      matchedItems: [],
    };
  }

  // 表示用にパラメータ名で重複除去
  // フォーム除外パラメータ（ガラス転移点等）は評価には使うが結果テーブルには表示しない
  // 同一パラメータが複数記事に登場する場合は代表値を1件に絞る
  // 優先順: ①特異度が高い ②特異度同値なら超過したレコードを優先（判定根拠として表示するため）
  const seenByParam = new Map<string, { specificity: number; c: ThresholdComparison }>();
  for (const c of allComparisons) {
    if (formExcluded.has(c.threshold.parameter_ja)) continue;
    const tags = c.threshold.material_tags as string[];
    const spec = calcSpecificity(tags, expandedKeywords);
    const existing = seenByParam.get(c.threshold.parameter_ja);
    const betterSpec = !existing || spec > existing.specificity;
    const sameSpecExceeded = existing && spec === existing.specificity && c.exceeded && !existing.c.exceeded;
    if (betterSpec || sameSpecExceeded) {
      seenByParam.set(c.threshold.parameter_ja, { specificity: spec, c });
    }
  }
  const displayComparisons = Array.from(seenByParam.values()).map((v) => v.c);

  // 超過している項目があるが全AND条件が揃っていない場合の理由説明
  const someExceeded = displayComparisons.some((c) => c.exceeded);
  const exceededNames = displayComparisons.filter((c) => c.exceeded).map((c) => c.threshold.parameter_ja);

  return {
    verdict: anyExceeded ? '許可必要' : '非該当（許可不要）',
    reason: anyExceeded
      ? `${matchedItems.join('、')} の閾値を超過しています。輸出許可申請が必要です。`
      : someExceeded
        ? `${exceededNames.join('・')}は規制値を超えていますが、法令は同条文内の全パラメータが同時に超過している場合のみ規制対象（AND条件）のため、非該当です。`
        : 'すべての入力値が規制閾値の範囲内です。',
    comparisons: displayComparisons,
    matchedItems,
  };
}

// フォーム別の除外パラメータ
// 数値（特異度）では素材特性と複合材特性を区別できないため名前で明示する
// fiber_material = 素材単体（マトリックス樹脂なし）→ 樹脂特性のパラメータを除外
const FORM_EXCLUDED_PARAMS: Record<string, Set<string>> = {
  fiber_material: new Set(['ガラス転移点']),
};

// 材料キーワードから関連パラメータ一覧を取得（UIのフォーム生成用）
export async function getRequiredParameters(
  materialKeywords: string[],
  targetArticles: string[] = [],
  formId: string = ''
): Promise<{ parameter_ja: string; parameter_en: string | null; unit: string; display_expr: string }[]> {
  const db = createServerClient();
  const expandedKeywords = expandKeywords(materialKeywords);

  let paramQuery = db
    .from('regulation_thresholds')
    .select('parameter_ja, parameter_en, unit, display_expr, material_tags, article_num, threshold_value')
    .overlaps('material_tags', expandedKeywords);
  if (targetArticles.length > 0) {
    paramQuery = paramQuery.in('article_num', targetArticles);
  }
  const { data } = await paramQuery
    .order('article_num')
    .order('threshold_value');

  const filtered = (data ?? []) as RegulationThreshold[];

  // 除外パラメータ（寸法系 + 名称未特定）
  // 軸数は第四条では「積層繊維方向数」（材料特性）のため除外しない
  const EXCLUDED_PARAMS = new Set(['外径', '内径', '厚さ', '幅', '（数値条件）']);

  const formExcluded = FORM_EXCLUDED_PARAMS[formId] ?? new Set<string>();

  // parameter_jaごとに「特異度」が最も高い代表値を選ぶ
  // 特異度 = 検索キーワードと一致するタグ数 / 総タグ数（高いほど対象材料に特化した閾値）
  const best = new Map<string, { specificity: number; entry: RegulationThreshold }>();
  for (const t of filtered) {
    if (EXCLUDED_PARAMS.has(t.parameter_ja)) continue;
    if (formExcluded.has(t.parameter_ja)) continue;
    const tags = t.material_tags as string[];
    const matchCount = tags.filter((tag) => expandedKeywords.includes(tag)).length;
    const specificity = matchCount / Math.max(tags.length, 1);
    const existing = best.get(t.parameter_ja);
    if (!existing || specificity > existing.specificity) {
      best.set(t.parameter_ja, { specificity, entry: t });
    }
  }
  return Array.from(best.values())
    .map(({ entry: t }) => ({ parameter_ja: t.parameter_ja, parameter_en: t.parameter_en, unit: t.unit, display_expr: t.display_expr }));
}
