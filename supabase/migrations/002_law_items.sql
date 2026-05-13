-- ============================================================
-- law_items: e-gov から直接取得した条文テキスト（LLM解釈なし）
-- ============================================================

CREATE TABLE law_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 条文の階層位置
  article_num     TEXT NOT NULL,   -- 例: 第四条
  item_num        TEXT NOT NULL,   -- 例: 第十五号
  sub_item_path   TEXT,            -- 例: ハ / ハ-(一) / ハ-(一)-１

  -- 条文本文
  full_text       TEXT NOT NULL,   -- 号＋配下のサブ項目テキストを結合したもの
  item_text       TEXT NOT NULL,   -- 号レベルのテキストのみ（直接の文章）

  -- 法令情報
  law_id          TEXT NOT NULL,   -- e-gov 法令ID
  source_law      TEXT NOT NULL,   -- 法令タイトル
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),

  -- 重複防止（同じ法令・条・号は1件のみ）
  UNIQUE (law_id, article_num, item_num)
);

-- 全文検索インデックス（日本語）
CREATE INDEX idx_law_items_fulltext
  ON law_items USING GIN (to_tsvector('simple', full_text));

-- 条文検索用
CREATE INDEX idx_law_items_article
  ON law_items (article_num);

-- RLS
ALTER TABLE law_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON law_items
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_write" ON law_items
  FOR ALL TO service_role USING (true);
