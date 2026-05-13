import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedRule } from './types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `あなたは日本の安全保障貿易管理（外為法）の専門家AIです。
貨物等省令の条文テキストを読み、輸出規制ルールを構造化データとして抽出します。

抽出ルール:
- regulationItem は条文が定める別表第一の項番号を正確に特定する（例: "1の項(1)", "4の項(15)"）
- 各材料・カテゴリ種別ごとに個別のルールとして抽出する
- 除外規定（〜を除く）は conditionType: "EXCLUDE" として別ルールで抽出する
- 閾値・数値条件は必ず含める
- ルールが存在しない条文（手続き規定のみ等）は空配列を返す

JSONLogicの変数名規約:
- elastic_modulus_m: 比弾性率（単位：m）
- tensile_strength_m: 比強度（単位：m）
- melting_point_celsius: 融点・軟化点（℃）
- sio2_content_pct: SiO2含有量（%）
- is_prepreg: プリプレグか否か（boolean）
- product_form: 製品形態（"fiber"|"prepreg"|"molded"|"semi"）`;

// tool_use スキーマ（これにより Claude は必ず valid JSON を返す）
const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_regulation_rules',
  description: '条文テキストから輸出規制ルールを抽出してJSONで返す',
  input_schema: {
    type: 'object' as const,
    properties: {
      rules: {
        type: 'array',
        description: '抽出された規制ルールの配列（ルールなしの場合は空配列）',
        items: {
          type: 'object',
          properties: {
            ruleCode:             { type: 'string', description: '一意のコード。例: RULE-4-15-CARBON-FIBER' },
            regulationItem:       { type: 'string', description: '別表第一の項番号。例: 5の項(18)' },
            subItem:              { type: 'string', description: '省令の条・号。例: 省令第4条第15号ハ' },
            descriptionJa:        { type: 'string', description: '人間向け説明（100字以内）' },
            targetMaterials:      { type: 'array', items: { type: 'string' }, description: '対象材料・カテゴリ' },
            conditionType:        { type: 'string', enum: ['MATCH', 'EXCLUDE', 'REQUIRE_REVIEW'] },
            conditionLogic:       { type: 'object', description: 'JSONLogic形式の判定条件' },
            conditionDescription: { type: 'string', description: '判定条件の簡潔な説明' },
            thresholds:           { type: 'object', description: '閾値の辞書。例: {"比弾性率_m": 2540000}' },
            sourceText:           { type: 'string', description: '根拠条文の原文（改行は省略可）' },
            effectiveFrom:        { type: 'string', description: '有効開始日。例: 1991-04-01' },
            sourceLaw:            { type: 'string', description: '根拠法令の条・号' },
          },
          required: ['ruleCode', 'regulationItem', 'subItem', 'descriptionJa',
                     'targetMaterials', 'conditionType', 'conditionLogic',
                     'conditionDescription', 'sourceText', 'effectiveFrom', 'sourceLaw'],
        },
      },
    },
    required: ['rules'],
  },
};

export async function interpretLawText(
  articleText: string,
  targetRegulationItems?: string[]
): Promise<ExtractedRule[]> {
  const itemsHint = targetRegulationItems?.length
    ? `対象項番（ヒント）: ${targetRegulationItems.join(', ')}\n`
    : '対象項番は条文中から自動判定してください。\n';

  const userPrompt = `以下の貨物等省令の条文から、輸出規制ルールを全て抽出してください。
${itemsHint}
【条文テキスト】
${articleText}`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'extract_regulation_rules' },
    messages: [{ role: 'user', content: userPrompt }],
  });

  // tool_use ブロックから入力を取得（必ず存在する）
  const toolBlock = message.content.find((b) => b.type === 'tool_use') as
    | Anthropic.ToolUseBlock
    | undefined;

  if (!toolBlock) throw new Error('tool_use ブロックが見つかりません');

  const input = toolBlock.input as { rules: ExtractedRule[] };
  return input.rules ?? [];
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
