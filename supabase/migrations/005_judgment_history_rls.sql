-- judgment_history に RLS を追加
-- ログイン済みユーザーのみ読み書き可能。匿名アクセスを遮断する

ALTER TABLE judgment_history ENABLE ROW LEVEL SECURITY;

-- ログインユーザーは全件参照可（社内共有前提）
CREATE POLICY "authenticated_read" ON judgment_history
  FOR SELECT TO authenticated USING (true);

-- 書き込みはサービスキー経由のみ（APIルートから）
-- service_role は RLS をバイパスするため policy 不要
