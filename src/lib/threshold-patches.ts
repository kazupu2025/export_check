import { createServerClient } from './supabase';

export interface PatchResult {
  deleted: number;
  errors: string[];
}

// ② 第三条 第十六号: 密度として誤抽出されたレコード
// unit='μm'/'mm' は密度の単位としてあり得ない → 繊維径・寸法の誤識別
const DELETE_MISIDENTIFIED_DENSITY = [
  'c688b302-e43f-4516-a004-c36f35bccd1f', // 密度 unit=μm value=100 → 繊維径
  'f3dcd64a-9260-478d-9894-418a0dca26da', // 密度 unit=mm value=120 → 寸法
];

// ③ 工作機械: 軸数>=2 の孤立グループ（false positive 源）
// 正しい閾値は同条文内の >=5 グループにあり、このグループは誤抽出
const DELETE_STANDALONE_AXIS_2 = [
  'e2ddc612-efde-46c2-8edd-032eb949b3a2', // 第五条 第二号: 軸数>=2 group 0（正: >=5 groups 10+）
  'af19b6df-14c1-480d-b637-1578000fe819', // 第一条 第十四号: 軸数>=2 group 0（正: >=5 groups 6+）
  '738409bc-09af-44f5-96d2-e98ad5126c3e', // 第一条 第三十五号: 軸数>=2 group 0 material_tags=[]
];

// ④ 工作機械: 軸数として誤識別された精度・寸法パラメータ
// 軸数（整数）に unit='m'/'mm'/'s' はあり得ない
// 正しいパラメータ（位置決め精度・一方向位置決めの繰返し性）は別レコードとして正しく存在する
const DELETE_WRONG_UNIT_AXIS = [
  'cf1b26c1-07a3-4ff8-942b-922197674967', // 第一条 第十四号: 軸数 unit='m' value=2
  'b3390512-566d-4e6f-986a-0af063f71d89', // 第五条 第二号: 軸数 unit='m' value=1
  '5ab6bad9-b4d4-47b0-b733-547b1189acbd', // 第五条 第二号: 軸数 unit='m' value=1 (重複)
  '7b8bce6c-cf12-4275-8891-2e7ef047b7a1', // 第五条 第二号: 軸数 unit='m' value=1 (重複)
  '4c5182b8-4f8e-4baa-bb6a-8f3400efc818', // 第五条 第二号: 軸数 unit='mm' value=0.0009
  'a032401e-1710-4d57-9e12-acbefcf6c2fe', // 第五条 第二号: 軸数 unit='mm' value=0.0009 (重複)
  '31db827e-d629-4340-a5f9-af43d2b4cced', // 第五条 第二号: 軸数 unit='mm' value=0.0011
  '89dbe233-7fb1-4c6f-98e1-fc5a72692cd5', // 第三条 第十七の三号: 軸数 unit='s' value=5
];

// ⑦ 第九条 第十号: 出力の上限条件（<=）が単独グループになっているため false positive 源
// 法令は「30Wを超え50W以下」という範囲表現だが抽出器が ">30W" と "<=50W" を別グループに分離した
// 正しくは同一 AND グループに統合して「30W < 出力 ≤ 50W」として評価する必要がある
// ⑦a: group 2 の "出力 <=50W" → group 1 の "出力 >30W" と AND 統合
// ⑦b: group 23 の "出力 <=50W" → group 22 の "出力 >30W" と AND 統合
// ⑧ 第九条 第十三号: group 7 の "出力 <=250W" の AND パートナー（レーダー間距離）が
//    material_tags=[] のため material ベースクエリで取得されず、単独超過として false positive になる
//    パートナー未取得での評価は誤りのため削除
const DELETE_LASER_UPPER_BOUND_ORPHAN = [
  'f7e8e976-be52-4fc2-9e65-72d183eddfbe', // 第九条 第十三号: 出力<=250W group 7（AND partner=レーダー間距離 tags=[] → 未取得）
];

// ⑥ 第五条 第四号: 軸数>=4 を condition_group 1→0 に統合（仕上がり形状寸法公差とAND条件）
const UPDATE_CONDITION_GROUP: { id: string; condition_group: number }[] = [
  { id: 'fcebbf24-3f41-4c76-9e8c-91fd82478625', condition_group: 0 },
  { id: 'eccb3419-f8a0-4500-ad7b-0a00de584a5f', condition_group: 1 }, // ⑦a 第九条 第十号: 出力<=50W → group 1 に統合
  { id: '0b1da644-478f-4038-8af4-3d6f213469e6', condition_group: 22 }, // ⑦b 第九条 第十号: 出力<=50W → group 22 に統合
];

export async function applyThresholdPatches(): Promise<PatchResult> {
  const db = createServerClient();
  const result: PatchResult = { deleted: 0, errors: [] };

  const targets = [
    ...DELETE_MISIDENTIFIED_DENSITY,
    ...DELETE_STANDALONE_AXIS_2,
    ...DELETE_WRONG_UNIT_AXIS,
    ...DELETE_LASER_UPPER_BOUND_ORPHAN,
  ];

  const { error, count } = await db
    .from('regulation_thresholds')
    .delete({ count: 'exact' })
    .in('id', targets);

  if (error) {
    result.errors.push(error.message);
  } else {
    result.deleted = count ?? 0;
  }

  for (const { id, condition_group } of UPDATE_CONDITION_GROUP) {
    const { error: ue } = await db
      .from('regulation_thresholds')
      .update({ condition_group })
      .eq('id', id);
    if (ue) result.errors.push(`UPDATE ${id}: ${ue.message}`);
  }

  return result;
}
