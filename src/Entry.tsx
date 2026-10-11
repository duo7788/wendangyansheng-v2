import { lazy, Suspense, useEffect, useState } from 'react';
import { IntroPage } from './intro/IntroPage';
import './entry.css';
const WorkspaceApp = lazy(() => import('./App'));
export default function Entry() {
  const [workspace, setWorkspace] = useState(() => window.location.hash.startsWith('#/workspace'));
  const [visited, setVisited] = useState(workspace);
  useEffect(() => {
    const navigate = () => { const next = window.location.hash.startsWith('#/workspace'); setWorkspace(next); if (next) setVisited(true); if (next || !window.location.hash) window.scrollTo(0, 0); };
    window.addEventListener('hashchange', navigate); return () => window.removeEventListener('hashchange', navigate);
  }, []);
  return <>{!workspace && <IntroPage onEnterApp={() => { window.location.hash = '/workspace'; }} />}{visited && <div style={{ display: workspace ? 'block' : 'none' }}><Suspense fallback={<div className="lp-loading">正在打开工作台…</div>}><WorkspaceApp /></Suspense><a className="lp-back-home" href="#" aria-label="返回介绍首页">← 产品首页</a></div>}</>;
}
