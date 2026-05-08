import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">輸出管理 該否判定システム</h1>
          <p className="mt-2 text-gray-500">
            安全保障貿易管理（外為法）リスト規制 / キャッチオール規制
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg">💬 該否判定を開始</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                輸出したい品目についてAIと対話しながら該否判定を行います。
                品目の特定からスペック確認まで会話形式でサポートします。
              </p>
              <Link href="/classify">
                <Button className="w-full bg-blue-600 hover:bg-blue-700">
                  判定を開始する →
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg">📋 規制ルール管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                e-gov（法令データベース）から最新の貨物等省令を取得し、
                AIが解釈した規制ルールを確認・管理します。
              </p>
              <Link href="/regulations">
                <Button variant="outline" className="w-full">
                  ルール一覧を見る →
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4">
            <p className="text-xs text-amber-800">
              ⚠️ このシステムの判定結果は参考情報です。
              最終的な該否判断は担当者が行い、不明な場合はCISTECへご確認ください。
              判定の証跡は必ず保管してください。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
