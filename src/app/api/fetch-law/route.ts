import { NextResponse } from 'next/server';
import { fetchAndParseLaw, flattenArticleToText } from '@/lib/egov-parser';

// GET /api/fetch-law
// e-govから貨物等省令を取得してパース結果を返す
export async function GET() {
  try {
    const { lawTitle, lawNum, articles, rawXml } = await fetchAndParseLaw();

    // 第1条・第4条など主要条文のテキストを抽出
    const article1 = articles.find((a) => a.articleNum.includes('第一条'));
    const article4 = articles.find((a) => a.articleNum.includes('第四条'));

    const summaries = articles.map((a) => ({
      articleNum: a.articleNum,
      itemCount: a.items.length,
    }));

    return NextResponse.json({
      lawTitle,
      lawNum,
      articleCount: articles.length,
      summaries,
      article1Text: article1 ? flattenArticleToText(article1) : null,
      article4Text: article4 ? flattenArticleToText(article4) : null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
