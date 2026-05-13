'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface LawItem {
  id: string;
  article_num: string;
  item_num: string;
  item_text: string;
  full_text: string;
  source_law: string;
  fetched_at: string;
}

type ProgressEvent =
  | { type: 'start'; message: string }
  | { type: 'progress'; message: string; total: number; current: number }
  | { type: 'article_done'; articleNum: string; itemsAdded: number; totalItems: number }
  | { type: 'warning'; message: string }
  | { type: 'complete'; message: string; totalItems: number; sourceLaw: string }
  | { type: 'error'; message: string };

export default function RegulationsPage() {
  const [items, setItems] = useState<LawItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [sourceLaw, setSourceLaw] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; article: string } | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractMessage, setExtractMessage] = useState<string | null>(null);
  const [extractProgress, setExtractProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeMessage, setCompleteMessage] = useState<string | null>(null);
  const [completeProgress, setCompleteProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [completeWarnings, setCompleteWarnings] = useState<string[]>([]);
  const [patching, setPatching] = useState(false);
  const [patchMessage, setPatchMessage] = useState<string | null>(null);

  useEffect(() => { loadItems(); }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/regulations');
      const data = await res.json() as { items: LawItem[]; fetchedAt: string | null; sourceLaw: string | null };
      setItems(data.items ?? []);
      setFetchedAt(data.fetchedAt);
      setSourceLaw(data.sourceLaw);
    } finally {
      setLoading(false);
    }
  };

  const runPatches = async () => {
    setPatching(true);
    setPatchMessage(null);
    try {
      const res = await fetch('/api/apply-patches', { method: 'POST' });
      const data = await res.json() as { deleted: number; updated: number; errors: string[] };
      if (data.errors.length > 0) {
        setPatchMessage(`❌ ${data.errors.join(' / ')}`);
      } else {
        setPatchMessage(`✅ パッチ適用完了: ${data.deleted} 件削除 / ${data.updated} 件更新`);
      }
    } catch (e) {
      setPatchMessage(`❌ ${e instanceof Error ? e.message : '不明なエラー'}`);
    } finally {
      setPatching(false);
    }
  };

  const runLlmComplete = async () => {
    setCompleting(true);
    setCompleteMessage(null);
    setCompleteProgress(null);
    setCompleteWarnings([]);
    try {
      const res = await fetch('/api/llm-complete-thresholds', { method: 'POST' });
      if (!res.body) throw new Error('ストリームを受信できません');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6)) as { type: string; message: string; current?: number; total?: number; updated?: number };
          if (event.type === 'progress') {
            setCompleteProgress({ current: event.current ?? 0, total: event.total ?? 0, message: event.message });
          } else if (event.type === 'complete') {
            setCompleteMessage(`✅ ${event.message}`);
            setCompleteProgress(null);
          } else if (event.type === 'warning') {
            setCompleteWarnings((prev) => [...prev, event.message]);
          } else if (event.type === 'error') {
            setCompleteMessage(`❌ ${event.message}`);
            setCompleteProgress(null);
          }
        }
      }
    } catch (e) {
      setCompleteMessage(`❌ ${e instanceof Error ? e.message : '不明なエラー'}`);
    } finally {
      setCompleting(false);
    }
  };

  const runExtract = async () => {
    setExtracting(true);
    setExtractMessage(null);
    setExtractProgress(null);
    try {
      const res = await fetch('/api/extract-thresholds', { method: 'POST' });
      if (!res.body) throw new Error('ストリームを受信できません');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6)) as { type: string; message: string; current?: number; total?: number; totalThresholds?: number };
          if (event.type === 'progress') {
            setExtractProgress({ current: event.current ?? 0, total: event.total ?? 0, message: event.message });
          } else if (event.type === 'complete') {
            setExtractMessage(`✅ ${event.message}`);
            setExtractProgress(null);
          } else if (event.type === 'error') {
            setExtractMessage(`❌ ${event.message}`);
            setExtractProgress(null);
          }
        }
      }
    } catch (e) {
      setExtractMessage(`❌ ${e instanceof Error ? e.message : '不明なエラー'}`);
    } finally {
      setExtracting(false);
    }
  };

  const runFetch = async () => {
    setFetching(true);
    setResultMessage(null);
    setProgress({ current: 0, total: 0, article: '開始中…' });

    try {
      const res = await fetch('/api/fetch-law-items', { method: 'POST' });
      if (!res.body) throw new Error('ストリームを受信できません');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6)) as ProgressEvent;

          if (event.type === 'progress') {
            setProgress({ current: event.current, total: event.total, article: event.message });
          } else if (event.type === 'article_done') {
            setProgress((p) => p ? { ...p, current: p.current + 1, article: event.articleNum } : null);
          } else if (event.type === 'complete') {
            setResultMessage(`✅ ${event.message}`);
            setProgress(null);
            await loadItems();
          } else if (event.type === 'error') {
            setResultMessage(`❌ エラー: ${event.message}`);
            setProgress(null);
          }
        }
      }
    } catch (e) {
      setResultMessage(`❌ エラー: ${e instanceof Error ? e.message : '不明なエラー'}`);
      setProgress(null);
    } finally {
      setFetching(false);
    }
  };

  // 漢数字 → 整数変換
  const KANJI: Record<string, number> = {
    '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'百':100
  };
  function kanjiToNum(s: string): number {
    let result = 0; let cur = 0;
    for (const ch of s) {
      const v = KANJI[ch];
      if (v === undefined) continue;
      if (v >= 10) { result += (cur || 1) * v; cur = 0; }
      else cur = v;
    }
    return result + cur;
  }
  function articleOrder(num: string): number {
    const m = num.match(/第([一二三四五六七八九十百]+)条/);
    return m ? kanjiToNum(m[1]) : 999;
  }
  function itemOrder(num: string): number {
    const m = num.match(/第([一二三四五六七八九十百]+)号/);
    return m ? kanjiToNum(m[1]) : 999;
  }

  // 条ごとにグループ化してソート
  const grouped = items.reduce<Record<string, LawItem[]>>((acc, item) => {
    acc[item.article_num] = [...(acc[item.article_num] ?? []), item];
    return acc;
  }, {});
  const sortedArticles = Object.keys(grouped).sort((a, b) => articleOrder(a) - articleOrder(b));
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => itemOrder(a.item_num) - itemOrder(b.item_num));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">法令データ管理</h1>
            <p className="text-sm text-gray-500">
              {sourceLaw ?? 'e-gov 貨物等省令'}
            </p>
            {fetchedAt && (
              <p className="text-xs text-gray-400 mt-0.5">
                最終取得: {new Date(fetchedAt).toLocaleString('ja-JP')}
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={runFetch}
              disabled={fetching || extracting}
              className="bg-green-600 hover:bg-green-700"
            >
              {fetching ? '取得中…' : '🔄 法令を再取得'}
            </Button>
            <Button
              onClick={runExtract}
              disabled={fetching || extracting || completing || items.length === 0}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {extracting ? '抽出中…' : '⚙️ 閾値を抽出'}
            </Button>
            <Button
              onClick={runLlmComplete}
              disabled={fetching || extracting || completing || items.length === 0}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {completing ? 'LLM補完中…' : '🤖 LLM補完実行'}
            </Button>
            <Button
              onClick={runPatches}
              disabled={fetching || extracting || completing || patching}
              className="bg-red-600 hover:bg-red-700"
            >
              {patching ? 'パッチ適用中…' : '🔧 既知誤抽出を修正'}
            </Button>
            <Button variant="outline" onClick={loadItems} disabled={fetching || extracting || completing}>
              再読み込み
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* パッチ適用結果 */}
        {patchMessage && !patching && (
          <div className={`p-3 rounded-lg text-sm ${patchMessage.startsWith('✅') ? 'bg-red-50 text-red-800' : 'bg-red-100 text-red-900'}`}>
            {patchMessage}
          </div>
        )}

        {/* LLM補完プログレス */}
        {completing && completeProgress && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-4 space-y-2">
              <div className="flex justify-between text-sm font-medium text-orange-800">
                <span>🤖 {completeProgress.message}</span>
                <span>{completeProgress.current} / {completeProgress.total} 条文</span>
              </div>
              {completeProgress.total > 0 && (
                <div className="w-full bg-orange-200 rounded-full h-2">
                  <div className="bg-orange-500 h-2 rounded-full transition-all"
                    style={{ width: `${(completeProgress.current / completeProgress.total) * 100}%` }} />
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {completeMessage && !completing && (
          <div className={`p-3 rounded-lg text-sm ${completeMessage.startsWith('✅') ? 'bg-orange-50 text-orange-800' : 'bg-red-50 text-red-800'}`}>
            {completeMessage}
          </div>
        )}
        {completeWarnings.length > 0 && !completing && (
          <div className="p-3 rounded-lg text-xs bg-yellow-50 text-yellow-800 space-y-1">
            <p className="font-medium">⚠️ スキップされた条文（{completeWarnings.length}件）:</p>
            {completeWarnings.map((w, i) => <p key={i}>{w}</p>)}
          </div>
        )}

        {/* 閾値抽出プログレス */}
        {extracting && extractProgress && (
          <Card className="border-purple-200 bg-purple-50">
            <CardContent className="pt-4 space-y-2">
              <div className="flex justify-between text-sm font-medium text-purple-800">
                <span>⚙️ {extractProgress.message}</span>
                <span>{extractProgress.current} / {extractProgress.total} 件</span>
              </div>
              {extractProgress.total > 0 && (
                <div className="w-full bg-purple-200 rounded-full h-2">
                  <div className="bg-purple-600 h-2 rounded-full transition-all"
                    style={{ width: `${(extractProgress.current / extractProgress.total) * 100}%` }} />
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {extractMessage && !extracting && (
          <div className={`p-3 rounded-lg text-sm ${extractMessage.startsWith('✅') ? 'bg-purple-50 text-purple-800' : 'bg-red-50 text-red-800'}`}>
            {extractMessage}
          </div>
        )}
        {/* 進捗バー */}
        {fetching && progress && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-4 space-y-2">
              <div className="flex justify-between text-sm font-medium text-blue-800">
                <span>{progress.article}</span>
                <span>{progress.total > 0 ? `${progress.current} / ${progress.total} 条文` : '準備中…'}</span>
              </div>
              {progress.total > 0 && (
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {resultMessage && !fetching && (
          <div className={`p-3 rounded-lg text-sm ${resultMessage.startsWith('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {resultMessage}
          </div>
        )}

        {loading ? (
          <p className="text-center text-gray-500 py-12">読み込み中…</p>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500 mb-4">法令データがまだ取得されていません。</p>
              <Button onClick={runFetch} disabled={fetching}>
                🔄 e-gov から法令を取得する
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              {Object.keys(grouped).length} 条文 / {items.length} 号
            </p>

            {sortedArticles.map((articleNum) => { const articleItems = grouped[articleNum]; return (
              <Card key={articleNum}>
                <CardHeader
                  className="pb-2 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedArticle(expandedArticle === articleNum ? null : articleNum)}
                >
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>
                      {articleNum}
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        {articleItems.length}号
                      </span>
                    </span>
                    <span className="text-gray-400 text-sm">
                      {expandedArticle === articleNum ? '▲' : '▼'}
                    </span>
                  </CardTitle>
                </CardHeader>

                {expandedArticle === articleNum && (
                  <CardContent className="space-y-2 pt-0">
                    {articleItems.map((item) => (
                      <div
                        key={item.id}
                        className="border rounded-lg overflow-hidden"
                      >
                        <div
                          className="flex items-start justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50"
                          onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium text-gray-500 mr-2">{item.item_num}</span>
                            <span className="text-sm text-gray-800 line-clamp-2">{item.item_text}</span>
                          </div>
                          <span className="text-gray-400 text-xs mt-0.5 shrink-0">
                            {expandedItem === item.id ? '▲' : '▼'}
                          </span>
                        </div>

                        {expandedItem === item.id && (
                          <div className="bg-amber-50 border-t border-amber-100 px-3 py-3">
                            <p className="text-xs text-amber-900 whitespace-pre-wrap leading-relaxed">
                              {item.full_text}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            );})}
          </>
        )}
      </main>
    </div>
  );
}
