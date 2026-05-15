import { NextRequest, NextResponse } from 'next/server';
import { fetchAndParseLaw, flattenArticleToText } from '@/lib/egov-parser';
import { interpretLawText } from '@/lib/law-interpreter';
import { createServerClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/require-admin';

// POST /api/interpret-law
// 法令XMLを取得 → Geminiで解釈 → Supabaseに保存
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const { targetArticles, regulationItems, saveToDb } = await req.json() as {
      targetArticles: string[];        // 例: ["第一条", "第四条"]
      regulationItems: string[];       // 例: ["5の項(18)", "2の項(17)"]
      saveToDb: boolean;
    };

    // e-govから法令取得
    const { lawTitle, lawNum, articles } = await fetchAndParseLaw();

    // 指定条文のテキストを結合
    const relevantText = articles
      .filter((a) => targetArticles.some((t) => a.articleNum.includes(t)))
      .map(flattenArticleToText)
      .join('\n\n');

    if (!relevantText) {
      return NextResponse.json({ error: '指定した条が見つかりません' }, { status: 404 });
    }

    // Geminiで解釈
    const extractedRules = await interpretLawText(relevantText, regulationItems);

    // DBへ保存
    if (saveToDb && extractedRules.length > 0) {
      const db = createServerClient();
      const now = new Date().toISOString();
      const lawVersion = `${lawTitle} ${lawNum} (取得: ${now.slice(0, 10)})`;

      const rows = extractedRules.map((rule) => ({
        rule_code: rule.ruleCode,
        regulation_item: rule.regulationItem,
        sub_item: rule.subItem,
        description_ja: rule.descriptionJa,
        target_categories: rule.targetMaterials,
        condition_logic: rule.conditionLogic,
        condition_description: rule.conditionDescription,
        condition_type: rule.conditionType,
        priority: rule.conditionType === 'EXCLUDE' ? 1 : 10,
        effective_from: rule.effectiveFrom || '1991-04-01',
        source_law: rule.sourceLaw,
        source_text: rule.sourceText,
        is_active: true,
        law_version: lawVersion,
        updated_at: now,
      }));

      const { error } = await db
        .from('regulation_rules')
        .upsert(rows, { onConflict: 'rule_code' });

      if (error) throw new Error(`DB保存エラー: ${error.message}`);
    }

    return NextResponse.json({
      extractedRules,
      ruleCount: extractedRules.length,
      savedToDb: saveToDb,
      sourceLaw: lawTitle,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
