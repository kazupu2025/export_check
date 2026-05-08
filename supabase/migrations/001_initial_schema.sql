-- ============================================================
-- 輸出管理 該否判定システム 初期スキーマ
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- テーブル1: 規制ルール（e-gov XML + Gemini解釈で自動生成）
-- ============================================================
CREATE TABLE regulation_rules (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_code         TEXT UNIQUE NOT NULL,
  regulation_item   TEXT NOT NULL,      -- 例: "5の項(18)"
  sub_item          TEXT NOT NULL,      -- 例: "省令第4条第15号ハ"
  description_ja    TEXT NOT NULL,
  target_categories TEXT[] NOT NULL,    -- 対象材料・カテゴリ

  -- JSONLogic形式の判定条件
  condition_logic   JSONB NOT NULL,
  condition_description TEXT,
  condition_type    TEXT NOT NULL
    CHECK (condition_type IN ('MATCH','EXCLUDE','REQUIRE_REVIEW')),

  priority          INTEGER NOT NULL DEFAULT 10,

  -- 法令バージョン管理
  effective_from    DATE NOT NULL DEFAULT '1991-04-01',
  effective_to      DATE,
  source_law        TEXT NOT NULL,
  source_text       TEXT NOT NULL,      -- 根拠条文の原文（重要）
  law_version       TEXT,               -- 取得元のバージョン情報

  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- テーブル2: 判定ログ（証跡・監査記録）
-- ============================================================
CREATE TABLE classification_logs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id            TEXT NOT NULL,
  product_description   TEXT NOT NULL,
  identified_category   TEXT,
  specs                 JSONB NOT NULL DEFAULT '{}',
  rule_results          JSONB NOT NULL DEFAULT '[]',
  final_result          TEXT NOT NULL
    CHECK (final_result IN ('非該当（許可不要）','要人間確認','許可必要')),
  final_regulation_item TEXT,

  -- 判定時点のルールスナップショット（法改正後も再現可能に）
  regulation_snapshot   JSONB NOT NULL DEFAULT '[]',

  approval_status       TEXT DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected','not_required')),
  reviewer_comment      TEXT,
  reviewed_at           TIMESTAMPTZ,

  created_by            TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- テーブル3: 法令取得ログ（e-gov XMLの取得履歴）
-- ============================================================
CREATE TABLE law_fetch_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  law_id        TEXT NOT NULL,          -- e-gov法令ID
  law_title     TEXT,
  law_num       TEXT,
  fetched_at    TIMESTAMPTZ DEFAULT NOW(),
  rules_extracted INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'success'
    CHECK (status IN ('success','error')),
  error_message TEXT
);

-- ============================================================
-- インデックス
-- ============================================================
CREATE INDEX idx_regulation_rules_active
  ON regulation_rules(is_active, regulation_item);
CREATE INDEX idx_regulation_rules_categories
  ON regulation_rules USING GIN(target_categories);
CREATE INDEX idx_classification_logs_created
  ON classification_logs(created_at DESC);
CREATE INDEX idx_classification_logs_result
  ON classification_logs(final_result);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE regulation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_write" ON regulation_rules
  FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_read_write" ON classification_logs
  FOR ALL TO authenticated USING (true);
