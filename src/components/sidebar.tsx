'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/',            label: 'ホーム',         icon: '🏠' },
  { href: '/classify',    label: '該否判定',        icon: '⚖️' },
  { href: '/history',     label: '判定履歴',        icon: '📝' },
  { href: '/regulations', label: '法令データ管理',   icon: '📋' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-52 shrink-0 min-h-screen bg-gray-900 flex flex-col">
      {/* ロゴ */}
      <div className="px-4 py-5 border-b border-gray-700">
        <p className="text-xs text-gray-400 leading-tight">輸出管理</p>
        <p className="text-white font-bold text-sm leading-tight">該否判定システム</p>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* フッター */}
      <div className="px-4 py-3 border-t border-gray-700">
        <p className="text-xs text-gray-500">貨物等省令 v403M</p>
      </div>
    </aside>
  );
}
