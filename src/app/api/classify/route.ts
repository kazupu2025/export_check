import { NextRequest, NextResponse } from 'next/server';
import { classifyProduct, getRequiredParameters, type SpecInput } from '@/lib/classifier';

// GET /api/classify?keywords=ガラス繊維,炭素繊維&articles=第四条,第三条&form=fiber_material
export async function GET(req: NextRequest) {
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
// { keywords: string[], specs: SpecInput[], targetArticles?: string[], formId?: string } → 判定結果
export async function POST(req: NextRequest) {
  const { keywords, specs, targetArticles = [], formId = '' } = await req.json() as {
    keywords: string[];
    specs: SpecInput[];
    targetArticles?: string[];
    formId?: string;
  };
  const result = await classifyProduct(keywords, specs, targetArticles, formId);
  return NextResponse.json(result);
}
