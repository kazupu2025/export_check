import { NextRequest, NextResponse } from 'next/server';
import { classifyProduct, getRequiredParameters, type SpecInput } from '@/lib/classifier';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/require-auth';

// GET /api/classify?keywords=ガラス繊維,炭素繊維&articles=第四条,第三条&form=fiber_material
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const raw = req.nextUrl.searchParams.get('keywords') ?? '';
  const keywords = raw.split(',').map((k) => k.trim()).filter(Boolean);
  if (keywords.length === 0) return NextResponse.json({ parameters: [] });

  const articlesRaw = req.nextUrl.searchParams.get('articles') ?? '';
  const targetArticles = articlesRaw.split(',').map((a) => a.trim()).filter(Boolean);
  const formId = req.nextUrl.searchParams.get('form') ?? '';

  const parameters = await getRequiredParameters(keywords, targetArticles, formId);
  return NextResponse.json({ parameters });
}

// POST /api/classify
// { keywords, specs, targetArticles?, formId?, productName?, formLabel? } → 判定結果
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const {
    keywords,
    specs,
    targetArticles = [],
    formId = '',
    productName = '',
    formLabel = '',
  } = await req.json() as {
    keywords: string[];
    specs: SpecInput[];
    targetArticles?: string[];
    formId?: string;
    productName?: string;
    formLabel?: string;
  };

  const result = await classifyProduct(keywords, specs, targetArticles, formId);

  // 判定履歴を保存（失敗しても判定結果は返す）
  if (productName) {
    const db = createServerClient();
    await db.from('judgment_history').insert({
      product_name: productName,
      form_id: formId,
      form_label: formLabel,
      keywords,
      specs,
      verdict: result.verdict,
      matched_items: result.matchedItems,
      reason: result.reason,
      comparisons: result.comparisons,
    });
  }

  return NextResponse.json(result);
}
