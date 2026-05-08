// 該否判定システム 型定義

export type FinalResult =
  | '非該当（許可不要）'
  | '要人間確認'
  | '許可必要';

export type ConditionType = 'MATCH' | 'EXCLUDE' | 'REQUIRE_REVIEW';

// e-gov XMLから抽出した生の条文データ
export interface RawArticle {
  articleNum: string;      // 例: "第四条"
  articleCaption?: string;
  items: RawItem[];
}

export interface RawItem {
  itemNum: string;         // 例: "十五"
  sentences: string[];     // 条文テキスト
  subitems: RawSubitem[];
}

export interface RawSubitem {
  subitemNum: string;      // 例: "イ", "ロ", "ハ"
  sentences: string[];
  children: RawSubitem[];
}

// Geminiが解釈して生成する構造化ルール
export interface ExtractedRule {
  ruleCode: string;           // 例: "RULE-5-18-HA-GLASS"
  regulationItem: string;     // 例: "5の項(18)"
  subItem: string;            // 例: "省令第4条第15号ハ"
  descriptionJa: string;      // 人間向け説明
  targetMaterials: string[];  // 対象材料
  conditionType: ConditionType;
  conditionLogic: Record<string, unknown>; // JSONLogic
  conditionDescription: string;
  thresholds: Record<string, number | string>;
  sourceText: string;         // 根拠条文の原文
  effectiveFrom: string;
  sourceLaw: string;
}

// チャットメッセージ
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// 判定セッション状態
export interface ClassifySession {
  sessionId: string;
  productDescription: string;
  identifiedCategory?: string;
  collectedSpecs: Record<string, unknown>;
  applicableRules: ExtractedRule[];
  phase: 'identifying' | 'collecting_specs' | 'evaluating' | 'done';
}

// 判定結果
export interface RuleEvalResult {
  ruleCode: string;
  regulationItem: string;
  subItem: string;
  conditionType: ConditionType;
  result: '該当' | '非該当' | '要確認' | '除外適用' | '除外非適用';
  evaluatedValues: Record<string, unknown>;
  thresholdValues: Record<string, unknown>;
  sourceText: string;
  note: string;
}

export interface ClassificationResult {
  finalResult: FinalResult;
  finalRegulationItem?: string;
  ruleResults: RuleEvalResult[];
  nextAction: string;
  classifiedAt: Date;
}

// Supabase テーブル型
export interface DbRegulationRule {
  id: string;
  rule_code: string;
  regulation_item: string;
  sub_item: string;
  description_ja: string;
  target_categories: string[];
  condition_logic: Record<string, unknown>;
  condition_description: string;
  condition_type: ConditionType;
  priority: number;
  effective_from: string;
  effective_to?: string;
  source_law: string;
  source_text: string;
  is_active: boolean;
  law_version: string;       // e-gov取得時のバージョン情報
  created_at: string;
  updated_at: string;
}

export interface DbClassificationLog {
  id: string;
  session_id: string;
  product_description: string;
  identified_category: string;
  specs: Record<string, unknown>;
  rule_results: RuleEvalResult[];
  final_result: FinalResult;
  final_regulation_item?: string;
  approval_status: 'pending' | 'approved' | 'rejected' | 'not_required';
  created_by: string;
  created_at: string;
}
