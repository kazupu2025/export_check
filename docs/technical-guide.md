# 技術解説書 — 輸出管理 該否判定システム

> 対象: 開発者・システム管理者  
> 最終更新: 2026-05-13

---

## システム概要

日本の外為法（貨物等省令 403M50000400049）に基づく輸出管理該否判定システム。  
e-gov APIから法令XMLを取得・構造化し、ユーザーが入力した実測値と規制閾値を**数値比較**して自動判定する。

LLMは「パラメータ名の補完」と「チャット」にのみ使用し、判定ロジック本体はLLMに依存しない。  
これによりガラス繊維等の組成依存型規制を確実に評価できる。

---

## アーキテクチャ

```
ユーザー
  │
  ▼
Next.js App Router (UI + API Routes)
  │
  ├─ /api/classify ─────────── 判定コアロジック（DB数値比較）
  ├─ /api/history ──────────── 判定履歴取得
  ├─ /api/fetch-law-items ──── e-gov XML取得・パース
  ├─ /api/extract-thresholds ─ 正規表現による閾値抽出
  ├─ /api/llm-complete-thresholds ── Anthropic API（名称補完）
  └─ /api/apply-patches ────── 誤抽出修正パッチ適用
  │
  ▼
Supabase (PostgreSQL)
  ├─ law_items              … 法令条文テキスト
  ├─ regulation_thresholds  … 数値閾値（判定の主データ）
  └─ judgment_history       … 判定履歴（証跡保管）
```

---

## データベース設計

### `law_items` — 法令条文

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | PK |
| law_id | TEXT | 法令番号（403M50000400049） |
| article_num | TEXT | 条番号（例: 第四条） |
| item_num | TEXT | 号番号（例: 第十五号） |
| item_text | TEXT | 号の本文 |
| full_text | TEXT | 条文全文（閾値抽出・根拠条文表示に使用） |
| source_law | TEXT | 法令名称 |
| fetched_at | TIMESTAMPTZ | 取得日時 |

### `regulation_thresholds` — 規制閾値

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | PK |
| law_item_id | UUID | law_items.id への外部キー |
| article_num | TEXT | 条番号 |
| item_num | TEXT | 号番号 |
| parameter_ja | TEXT | パラメータ名（日本語） |
| parameter_en | TEXT | パラメータ名（英語スネークケース） |
| unit | TEXT | 単位（%, m, W, ℃ など） |
| threshold_value | NUMERIC | 閾値の数値 |
| threshold_op | TEXT | 比較演算子（`>=`, `>`, `<=`, `<`, `==`） |
| display_expr | TEXT | 表示用文字列（例: "五〇パーセント以上"） |
| material_tags | TEXT[] | 材料タグ配列（クエリフィルタに使用） |
| condition_group | INT | AND/OR評価グループ番号 |
| condition_conjunction | TEXT | グループ内結合（OR固定） |
| source_text | TEXT | 根拠条文テキスト |

### `judgment_history` — 判定履歴

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | PK |
| created_at | TIMESTAMPTZ | 判定日時 |
| product_name | TEXT | 品目名（ユーザー入力） |
| form_id | TEXT | フォームID |
| form_label | TEXT | フォーム表示名 |
| keywords | TEXT[] | 入力キーワード |
| specs | JSONB | 入力スペック配列 |
| verdict | TEXT | 判定結果 |
| matched_items | TEXT[] | 該当条文リスト |
| reason | TEXT | 判定理由テキスト |
| comparisons | JSONB | パラメータ比較詳細（根拠条文含む） |

---

## 判定コアロジック

### condition_group による AND/OR 評価

法令の複合条件を `condition_group` フィールドで表現する。

```
同一 condition_group 内 = AND（すべての条件が必要）
異なる condition_group 間 = OR（いずれかの条件で成立）
```

**例: 第五条 第四号（工作機械）**

| condition_group | パラメータ | 条件 |
|-----------------|-----------|------|
| 0 | 軸数 | >= 4 |
| 0 | 仕上がり形状寸法公差 | <= 0.0009 mm |
| 1 | 軸数 | >= 5 |
| ... | ... | ... |

→ group 0 の「軸数 >= 4 かつ 公差 <= 0.0009」がすべて成立したとき許可必要

### 評価アルゴリズム（`src/lib/classifier.ts`）

```
1. material_tags × article_num でDBをフィルタ
2. article_num + item_num でグループ化（条文単位）
3. 各条文内で condition_group ごとにAND評価
4. いずれかの condition_group でfull一致 → 許可必要
```

入力値がない（空欄の）パラメータは「確認不能 = 不成立」として扱い、**false positiveを防ぐ**。

### KEYWORD_EXPANSION（`src/lib/classifier.ts`）

ユーザーが入力する通称と法令上の分類語を橋渡しする辞書。

```typescript
'ガラス繊維':   ['ガラス繊維', '無機繊維']
'マシニングセンタ': ['工作機械']
'CFRP':         ['炭素繊維', '複合材料']
'レーザー発振器': ['レーザー', 'レーザ']
```

完全一致のほか、「ガラス繊維製品」→「ガラス繊維」を含むキーとも部分一致する。

---

## 法令データパイプライン

```
① 法令取得（e-gov API）
   └─ 法令XML → egov-parser.ts でパース → law_items に保存
      ※ 実行前に既存レコードを全削除（再取得時も同様）

② 閾値抽出（正規表現）
   └─ law_items.full_text → regex-extractor.ts → regulation_thresholds に保存
      ※ 実行前に既存レコードを全削除

③ LLM補完（Anthropic API）
   └─ parameter_ja = '（数値条件）' のレコードのみ対象
   └─ 同一 law_item_id をまとめて1回のAPI呼び出しで処理（コスト最小化）
      ※ 対象ゼロなら即完了（空振り）

④ パッチ適用（threshold-patches.ts）
   └─ 誤抽出レコードを DELETE / condition_group を UPDATE
   └─ 条件はUUID不使用（article_num + parameter_ja + unit + threshold_value + condition_group）
      ※ 法令が変わらない限り毎回同じレコードに当たる
```

### パッチの追加方法

判定結果が誤りと判明した場合は `src/lib/threshold-patches.ts` にパッチを追加する。

**パターンA: 誤抽出レコードの削除**
```typescript
// DELETE_PATCHES に追加
{
  description: '第X条 第Y号: パラメータ名 unit=ZZ（誤識別の理由）',
  match: { article_num: '第X条', item_num: '第Y号', parameter_ja: 'XXX', unit: 'ZZ' },
},
```

**パターンB: AND条件グループの修正**
```typescript
// UPDATE_PATCHES に追加
{
  description: '第X条 第Y号: パラメータ group N → group M に統合',
  match: { article_num: '第X条', item_num: '第Y号', parameter_ja: 'XXX',
           threshold_op: '<=', threshold_value: 50, condition_group: N },
  set: { condition_group: M },
},
```

追加後、管理画面の「🔧 既知誤抽出を修正」ボタンで適用する。

---

## API一覧

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/classify | パラメータ一覧取得（フォーム生成用） |
| POST | /api/classify | 該否判定実行・履歴保存 |
| GET | /api/history | 判定履歴取得（最新200件） |
| POST | /api/fetch-law-items | e-govから法令取得・保存（SSE） |
| POST | /api/extract-thresholds | 正規表現で閾値抽出（SSE） |
| POST | /api/llm-complete-thresholds | LLMでパラメータ名補完（SSE） |
| POST | /api/apply-patches | 誤抽出修正パッチ適用 |
| GET | /api/regulations | 閾値一覧取得（管理UI用） |

SSE = Server-Sent Events（進捗をリアルタイムストリーム）

---

## フォームと対象条文の対応

| formId | 対象条文 | 除外パラメータ（表示） |
|--------|---------|---------------------|
| fiber_material | 第四条 | ガラス転移点 |
| shaped_article | 第一条・第三条 | なし |
| machine_tool | 第一条・第五条 | なし |
| laser_optics | 第一条・第九条 | なし |
| electronics | 第六条・第九条 | なし |
| chemical | 第二条・第二条の二・第三条 | なし |
| all | 全条文 | なし |

`FORM_EXCLUDED_PARAMS` で指定されたパラメータは**表示から除外されるが評価は行う**。  
（評価から除外すると、同グループの他条件だけで超過判定されfalse positiveが生じるため）

---

## 既知の設計上の制約

| 制約 | 内容 |
|------|------|
| 寸法系パラメータ | `外径`・`内径`・`厚さ`・`幅` は `EXCLUDED_PARAMS` によりフォームに表示されない。フォームから評価不能 |
| material_tags=[] | 空タグのレコードは `overlaps()` クエリで取得されない。AND パートナーが空タグの条件は評価不能 |
| 上限条件の孤立 | `<=` 単独グループは false positive 源。`threshold-patches.ts` で下限グループとAND統合が必要 |
| キャッチオール規制 | 本システムはリスト規制のみ対応。需要者・用途ベースのキャッチオール判定は対象外 |

---

## 法令改正時の対応手順

```
1. /regulations → 「⬇️ 法令を再取得」
2. /regulations → 「⚙️ 閾値を抽出」
3. /regulations → 「🤖 LLM補完実行」（数分・数百円程度）
4. /regulations → 「🔧 既知誤抽出を修正」
5. 5製品群テストを実施して判定結果を確認
6. 新たな誤抽出があれば threshold-patches.ts にパッチを追加して再度 4 を実行
```

パッチは条件指定（UUID不使用）のため、法令テキストが変わらない箇所は自動で正しく適用される。

---

## セキュリティ

| 項目 | 対策 |
|------|------|
| APIキー管理 | `.env.local`（gitignore済み）で管理 |
| シークレット漏洩防止 | pre-commitフックで検出・ブロック |
| GitHub Secret Protection | Settings → Security and quality → 有効化（手動） |
| 認証 | 現状なし（社内アクセス限定を前提） |

---

## 環境変数

| 変数名 | 用途 |
|--------|------|
| NEXT_PUBLIC_SUPABASE_URL | Supabase プロジェクトURL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase 匿名キー（フロントエンド用） |
| SUPABASE_SERVICE_KEY | Supabase サービスキー（APIルート用） |
| ANTHROPIC_API_KEY | Anthropic Claude API キー |
| GEMINI_API_KEY | Google Gemini API キー（旧チャット機能用） |
