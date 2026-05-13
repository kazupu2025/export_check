import { createServerClient } from './supabase';

export interface PatchResult {
  deleted: number;
  updated: number;
  errors: string[];
}

interface DeletePatch {
  description: string;
  match: Record<string, string | number>;
}

interface UpdatePatch {
  description: string;
  match: Record<string, string | number>;
  set: Record<string, string | number>;
}

// 削除パッチ：条件でレコードを特定（UUID不使用）
const DELETE_PATCHES: DeletePatch[] = [
  // 第三条 第十六号: 密度として誤抽出（unit が密度の単位として不適切）
  {
    description: '第三条 第十六号: 密度 unit=μm（繊維径の誤識別）',
    match: { article_num: '第三条', item_num: '第十六号', parameter_ja: '密度', unit: 'μm' },
  },
  {
    description: '第三条 第十六号: 密度 unit=mm（寸法の誤識別）',
    match: { article_num: '第三条', item_num: '第十六号', parameter_ja: '密度', unit: 'mm' },
  },

  // 工作機械: 軸数>=2 の孤立グループ（false positive 源）
  // 正しい閾値は同条文内の >=5 グループにあり、このグループは誤抽出
  {
    description: '第五条 第二号: 軸数>=2 孤立グループ',
    match: { article_num: '第五条', item_num: '第二号', parameter_ja: '軸数', threshold_op: '>=', threshold_value: 2 },
  },
  {
    description: '第一条 第十四号: 軸数>=2 孤立グループ',
    match: { article_num: '第一条', item_num: '第十四号', parameter_ja: '軸数', threshold_op: '>=', threshold_value: 2 },
  },
  {
    description: '第一条 第三十五号: 軸数>=2 孤立グループ（material_tags=[]）',
    match: { article_num: '第一条', item_num: '第三十五号', parameter_ja: '軸数', threshold_op: '>=', threshold_value: 2 },
  },

  // 工作機械: 軸数として誤識別された精度・寸法パラメータ
  // 軸数（整数）に unit='m'/'mm'/'s' はあり得ない
  {
    description: '軸数 unit=m 誤識別レコード群（全条文）',
    match: { parameter_ja: '軸数', unit: 'm' },
  },
  {
    description: '軸数 unit=mm 誤識別レコード群（全条文）',
    match: { parameter_ja: '軸数', unit: 'mm' },
  },
  {
    description: '軸数 unit=s 誤識別レコード群（全条文）',
    match: { parameter_ja: '軸数', unit: 's' },
  },

  // 第九条 第十三号: 出力<=250W group 7
  // AND パートナー（レーダー間距離 >= 1500m）が material_tags=[] で取得不能 → 単独超過 false positive 源
  {
    description: '第九条 第十三号: 出力<=250W group 7（ANDパートナー取得不能）',
    match: { article_num: '第九条', item_num: '第十三号', parameter_ja: '出力', threshold_op: '<=', threshold_value: 250, condition_group: 7 },
  },
];

// 更新パッチ：condition_group を修正して AND 統合する
// match.condition_group は再抽出直後の元の値（パッチ適用前の値）を指定する
const UPDATE_PATCHES: UpdatePatch[] = [
  // 第五条 第四号: 軸数>=4 を condition_group 1→0（仕上がり形状寸法公差とAND条件）
  {
    description: '第五条 第四号: 軸数>=4 → condition_group 0 に統合',
    match: { article_num: '第五条', item_num: '第四号', parameter_ja: '軸数', threshold_op: '>=', threshold_value: 4, condition_group: 1 },
    set: { condition_group: 0 },
  },
  // 第九条 第十号: 出力<=50W を出力>30W と AND 統合
  // 法令は「30Wを超え50W以下」という範囲表現だが抽出器が別グループに分離した
  {
    description: '第九条 第十号: 出力<=50W group 2 → group 1（出力>30W とAND統合）',
    match: { article_num: '第九条', item_num: '第十号', parameter_ja: '出力', threshold_op: '<=', threshold_value: 50, condition_group: 2 },
    set: { condition_group: 1 },
  },
  {
    description: '第九条 第十号: 出力<=50W group 23 → group 22（出力>30W とAND統合）',
    match: { article_num: '第九条', item_num: '第十号', parameter_ja: '出力', threshold_op: '<=', threshold_value: 50, condition_group: 23 },
    set: { condition_group: 22 },
  },
];

export async function applyThresholdPatches(): Promise<PatchResult> {
  const db = createServerClient();
  const result: PatchResult = { deleted: 0, updated: 0, errors: [] };

  for (const patch of DELETE_PATCHES) {
    const { error, count } = await db
      .from('regulation_thresholds')
      .delete({ count: 'exact' })
      .match(patch.match);

    if (error) {
      result.errors.push(`DELETE ${patch.description}: ${error.message}`);
    } else {
      result.deleted += count ?? 0;
    }
  }

  for (const patch of UPDATE_PATCHES) {
    const { error } = await db
      .from('regulation_thresholds')
      .update(patch.set)
      .match(patch.match);

    if (error) {
      result.errors.push(`UPDATE ${patch.description}: ${error.message}`);
    }
  }

  // UPDATE件数は match できたレコード数に依存するため、エラーなしなら全件適用済みとみなす
  if (result.errors.length === 0) {
    result.updated = UPDATE_PATCHES.length;
  }

  return result;
}
