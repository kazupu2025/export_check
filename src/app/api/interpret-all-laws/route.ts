import { NextResponse } from 'next/server';
import { fetchAndParseLaw, flattenArticleToText } from '@/lib/egov-parser';
import { interpretLawText } from '@/lib/law-interpreter';
import { createServerClient } from '@/lib/supabase';
import type { ExtractedRule } from '@/lib/types';

// POST /api/interpret-all-laws
// 全条文を順次処理してDBに保存。SSEでリアルタイム進捗を返す
export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ type: 'start', message: 'e-gov から法令を取得中…' });

        const { lawTitle, lawNum, articles } = await fetchAndParseLaw();
        const db = createServerClient();
        const now = new Date().toISOString();
        const lawVersion = `${lawTitle} ${lawNum} (取得: ${now.slice(0, 10)})`;

        // 号が0件の条文はスキップ（手続き規定のみ等）
        const targetArticles = articles.filter((a) => a.items.length > 0);

        send({
          type: 'progress',
          message: `${targetArticles.length}条文を処理します`,
          total: targetArticles.length,
          current: 0,
        });

        let totalRules = 0;
        let processedCount = 0;

        for (const article of targetArticles) {
          const articleText = flattenArticleToText(article);

          send({
            type: 'progress',
            message: `${article.articleNum} を解析中…`,
            total: targetArticles.length,
            current: processedCount,
            articleNum: article.articleNum,
          });

          let rules: ExtractedRule[] = [];
          try {
            rules = await interpretLawText(articleText);
          } catch (e) {
            send({
              type: 'warning',
              message: `${article.articleNum}: 解析エラー (${e instanceof Error ? e.message : '不明'})`,
            });
            processedCount++;
            continue;
          }

          if (rules.length > 0) {
            const rows = rules.map((rule) => ({
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

            if (error) {
              send({ type: 'warning', message: `${article.articleNum}: DB保存エラー: ${error.message}` });
            } else {
              totalRules += rules.length;
              send({
                type: 'article_done',
                articleNum: article.articleNum,
                rulesAdded: rules.length,
                totalRules,
              });
            }
          } else {
            send({
              type: 'article_done',
              articleNum: article.articleNum,
              rulesAdded: 0,
              totalRules,
              skipped: true,
            });
          }

          processedCount++;
        }

        send({
          type: 'complete',
          message: `完了: ${totalRules}件のルールを取得・保存しました（${lawTitle}）`,
          totalRules,
          sourceLaw: lawTitle,
        });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : '不明なエラー' });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
