import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ExtractedRule } from './types';

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genai.getGenerativeModel({ model: 'gemini-1.5-flash' });

const SYSTEM_PROMPT = `あなたは日本の安全保障貿易管理（外為法）の専門家AIです。
貨物等省令の条文テキストを読み、輸出規制ルールを構造化データとして抽出します。

以下のJSONフォーマットで回答してください（配列形式）。
コードブロックや説明文は不要です。JSONのみを返してください。

[
  {
    "ruleCode": "RULE-{項番}-{繊維種別等の識別子}",
    "regulationItem": "例: 5の項(18)",
    "subItem": "例: 省令第4条第15号ハ",
    "descriptionJa": "人間が読む条件の説明（100字以内）",
    "targetMaterials": ["ガラス繊維", "無機繊維"],
    "conditionType": "MATCH" | "EXCLUDE" | "REQUIRE_REVIEW",
    "conditionLogic": { /* JSONLogic形式 */ },
    "conditionDescription": "判定条件の簡潔な説明",
    "thresholds": { "比弾性率_m": 2540000, "融点_celsius": 1649 },
    "sourceText": "根拠となる条文の原文（引用）",
    "effectiveFrom": "YYYY-MM-DD",
    "sourceLaw": "省令第4条第15号ハ"
  }
]

JSONLogicの書き方:
- 「比弾性率 > 2,540,000m」→ {">": [{"var": "elastic_modulus_m"}, 2540000]}
- 「融点 > 1649℃」→ {">": [{"var": "melting_point_celsius"}, 1649]}
- 「かつ（AND）」→ {"and": [...]}
- 「または（OR）」→ {"or": [...]}
- 除外規定は conditionType: "EXCLUDE" とし、該当すれば非該当方向になる

変数名の規約:
- elastic_modulus_m: 比弾性率（単位：m）
- tensile_strength_m: 比強度（単位：m）
- melting_point_celsius: 融点・軟化点（℃）
- sio2_content_pct: SiO2含有量（%）
- is_prepreg: プリプレグか否か（boolean）
- product_form: 製品形態（"fiber"|"prepreg"|"molded"|"semi"）
- primary_use: 主用途
- is_centrifuge_rotor_use: ガス遠心分離機ロータ用途（boolean）`;

export async function interpretLawText(
  articleText: string,
  targetRegulationItems: string[]
): Promise<ExtractedRule[]> {
  const prompt = `${SYSTEM_PROMPT}

以下の貨物等省令の条文から、次の規制項番に関連するルールを全て抽出してください。
対象項番: ${targetRegulationItems.join(', ')}

【条文テキスト】
${articleText}

特に注意:
- 各繊維種別（有機繊維・炭素繊維・無機繊維・ガラス繊維）ごとに個別のルールとして抽出
- 除外規定（〜を除く）は conditionType: "EXCLUDE" として別ルールで抽出
- 融点・軟化点の条件も必ず含める
- 「成型品・半製品に限る」などの形態条件も含める`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // JSONブロックが含まれる場合は抽出
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`Geminiの応答からJSONを抽出できません: ${text.slice(0, 200)}`);

  return JSON.parse(jsonMatch[0]) as ExtractedRule[];
}

// 品目特定のための対話AIプロンプト
export function buildClassifySystemPrompt(rulesJson: string): string {
  return `あなたは日本の安全保障貿易管理（外為法）の該否判定アシスタントです。
ユーザーが輸出したい品目について質問に答えながら、該否判定を行います。

## あなたの役割
1. ユーザーが品目を説明したら、規制対象かどうかを特定するために質問する
2. 必要なスペック値を収集する
3. 規制閾値と比較して判定結果を提示する
4. 根拠となる条文を必ず引用する

## 利用可能な規制ルール
${rulesJson}

## 進め方
- Phase 1（品目特定）: 製品の種類・形態・用途を確認する質問を2〜3問
- Phase 2（スペック収集）: 規制判定に必要なパラメータを1つずつ質問
- Phase 3（判定）: 全パラメータが揃ったら判定結果と根拠を提示

## 判定結果の提示フォーマット
---
**判定結果: [非該当（許可不要）/ 要人間確認 / 許可必要]**

| パラメータ | 入力値 | 規制閾値 | 判定 |
|-----------|-------|---------|-----|
| 比弾性率 | X,XXX,XXX m | Y,YYY,YYY m | 未満/超過 |

**根拠条文**: [省令第4条第15号ハ 原文引用]
**次のアクション**: ...
---

## 重要な原則
- スペック未入力は「非該当」ではなく「要確認」とする
- 判定の最終責任は人間にある旨を必ず伝える
- 「要確認」「許可必要」の場合はCISTECへの確認を推奨する`;
}
