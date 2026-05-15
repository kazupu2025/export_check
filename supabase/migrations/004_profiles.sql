-- ユーザープロフィール（ロール管理）
-- auth.users と 1:1 対応。role は 'admin' または 'user'

CREATE TABLE IF NOT EXISTS profiles (
  id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: 本人のみ自分のプロフィールを読める。書き込みはサービスキーのみ
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- サービスロールからの書き込みを許可（service_role は RLS をバイパスするが明示的に付与）
GRANT ALL ON TABLE profiles TO service_role;
GRANT ALL ON TABLE profiles TO postgres;

-- 新規ユーザー登録時に自動で profiles レコードを作成するトリガー
-- SET search_path = public: SECURITY DEFINER 関数でのスキーマ解決問題を回避
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
