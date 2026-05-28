import { Activity, BarChart3, Crown, List, Swords } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getApiDisplayHost, getSummary } from '../api/client';

const nav = [
  { to: '/', label: 'Сводка', roman: 'I', icon: BarChart3 },
  { to: '/games', label: 'Партии', roman: 'II', icon: List },
  { to: '/leveling-curves', label: 'Кривые', roman: 'III', icon: Activity },
  { to: '/minions', label: 'Миньоны', roman: 'IV', icon: Swords }
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const summary = useQuery({ queryKey: ['summary'], queryFn: getSummary });
  const apiHost = getApiDisplayHost();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand">
            <span className="brand-mark">H</span>
            <span>
              <span className="brand-name">HDT Almanac</span>
              <span className="brand-sub">личная летопись таверны</span>
            </span>
          </NavLink>
          <nav className="nav">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-item">
                  <span className="roman">{item.roman}.</span>
                  <Icon size={15} strokeWidth={1.7} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
          <div className="topbar-meta">
            <span className="live-dot" />
            <span>API</span>
            <span className="meta-value">{apiHost}</span>
            <span className="meta-divider" />
            <Crown size={14} />
            <span className="meta-value">{summary.data?.latestMmr?.toLocaleString('ru-RU') ?? '—'}</span>
          </div>
        </div>
      </header>
      <main className="container">{children}</main>
      <footer className="footer">
        <span>HDT Battlegrounds Tracker</span>
        <span>SQLite · Node Express · React</span>
        <span>локальные данные, без облака</span>
      </footer>
    </div>
  );
}
