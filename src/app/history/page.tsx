'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SpecRecord {
  parameter_ja: string;
  value: number;
  unit: string;
}

interface ComparisonRecord {
  threshold: {
    article_num: string;
    item_num: string;
    parameter_ja: string;
    unit: string;
    display_expr: string;
    source_text?: string;
  };
  userValue: number;
  exceeded: boolean;
}

interface JudgmentHistory {
  id: string;
  created_at: string;
  product_name: string;
  form_label: string;
  keywords: string[];
  specs: SpecRecord[];
  verdict: string;
  matched_items: string[];
  reason: string;
  comparisons: ComparisonRecord[];
}

const verdictStyle = (verdict: string) => {
  if (verdict === '許可必要') return 'bg-red-100 text-red-800 border-red-200';
  if (verdict === '非該当（許可不要）') return 'bg-green-100 text-green-800 border-green-200';
  return 'bg-yellow-100 text-yellow-800 border-yellow-200';
};

const verdictIcon = (verdict: string) => {
  if (verdict === '許可必要') return '🔴';
  if (verdict === '非該当（許可不要）') return '🟢';
  return '🟡';
};

export default function HistoryPage() {
  const [records, setRecords] = useState<JudgmentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  const toggleSource = (key: string) =>
    setExpandedSource((prev) => (prev === key ? null : key));

  useEffect(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then((data) => {
        setRecords(data as JudgmentHistory[]);
        setLoading(false);
      });
  }, []);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">判定履歴</h1>
          <p className="text-sm text-gray-500">過去に実行した該否判定の記録</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {loading && (
          <p className="text-center text-gray-500 py-12">読み込み中…</p>
        )}

        {!loading && records.length === 0 && (
          <p className="text-center text-gray-500 py-12">判定履歴がありません。</p>
        )}

        {!loading && records.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 text-right">{records.length} 件</p>
            {records.map((r) => (
              <Card key={r.id} className="overflow-hidden">
                <button
                  className="w-full text-left"
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  <CardContent className="py-4 flex items-center gap-4">
                    <span className={`shrink-0 px-2 py-1 rounded border text-xs font-medium ${verdictStyle(r.verdict)}`}>
                      {verdictIcon(r.verdict)} {r.verdict}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{r.product_name}</p>
                      <p className="text-xs text-gray-500">{r.form_label}</p>
                    </div>
                    <span className="shrink-0 text-xs text-gray-400">{formatDate(r.created_at)}</span>
                    <span className="text-gray-400 text-sm">{expandedId === r.id ? '▲' : '▼'}</span>
                  </CardContent>
                </button>

                {expandedId === r.id && (
                  <div className="border-t bg-gray-50 px-4 py-4 space-y-4">
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">判定理由</p>
                      <p className="text-sm text-gray-800">{r.reason}</p>
                    </div>

                    {r.specs.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-2">入力スペック</p>
                        <div className="flex flex-wrap gap-2">
                          {r.specs.map((s, i) => (
                            <span key={i} className="text-xs bg-white border rounded px-2 py-1 text-gray-700">
                              {s.parameter_ja}: {s.value} {s.unit}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {r.comparisons.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-2">パラメータ比較</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400 border-b">
                              <th className="text-left py-1 pr-3">パラメータ</th>
                              <th className="text-right py-1 pr-3">入力値</th>
                              <th className="text-center py-1 pr-3">閾値</th>
                              <th className="text-center py-1 pr-3">判定</th>
                              <th className="text-left py-1">条文</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.comparisons.map((c, i) => {
                              const srcKey = `${r.id}-${i}`;
                              return (
                                <tr key={i} className="border-b last:border-0 align-top">
                                  <td className="py-1 pr-3 font-medium">{c.threshold.parameter_ja}</td>
                                  <td className="py-1 pr-3 text-right font-mono">{c.userValue} {c.threshold.unit}</td>
                                  <td className="py-1 pr-3 text-center text-gray-600">{c.threshold.display_expr}</td>
                                  <td className="py-1 pr-3 text-center">
                                    {c.exceeded
                                      ? <span className="text-red-600 font-bold">超過</span>
                                      : <span className="text-green-600 font-bold">以内</span>}
                                  </td>
                                  <td className="py-1">
                                    {c.threshold.source_text ? (
                                      <>
                                        <button
                                          className="text-blue-600 hover:underline"
                                          onClick={() => toggleSource(srcKey)}
                                        >
                                          {c.threshold.article_num} {c.threshold.item_num} {expandedSource === srcKey ? '▲' : '▼'}
                                        </button>
                                        {expandedSource === srcKey && (
                                          <div className="mt-1 p-2 bg-amber-50 border border-amber-200 rounded whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto text-gray-700">
                                            {c.threshold.source_text}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-gray-500">{c.threshold.article_num} {c.threshold.item_num}</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
