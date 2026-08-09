import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, FileText, Calendar, CheckSquare, Settings, Check, UserCircle } from 'lucide-react';
import { AppIdentifier } from '../types';
import { USERS } from '../App';

interface SidebarProps {
  activeApp: AppIdentifier;
  setActiveApp: (app: AppIdentifier) => void;
  activeUserId: string;
  setActiveUserId: (id: string) => void;
  taskUnreadCount: number;
  taskPulseKey: number;
}

const apps: { id: AppIdentifier; icon: any; label: string }[] = [
  { id: 'messages', icon: MessageSquare, label: '消息' },
  { id: 'docs', icon: FileText, label: '文档' },
  { id: 'calendar', icon: Calendar, label: '日历' },
  { id: 'tasks', icon: CheckSquare, label: '任务' },
];

export function Sidebar({ activeApp, setActiveApp, activeUserId, setActiveUserId, taskUnreadCount, taskPulseKey }: SidebarProps) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const activeUser = USERS.find(u => u.id === activeUserId);

  return (
    <div className="w-[72px] flex flex-col items-center py-6 bg-zinc-100 border-r border-zinc-200/80 z-20 shrink-0 relative">
      <div className="mb-10">
        <button className="w-10 h-10 rounded-full overflow-hidden border border-zinc-200 shadow-sm transition-colors cursor-default ring-2 ring-transparent">
          {activeUser ? (
            <img src={activeUser.avatar} alt={activeUser.name} className="w-full h-full object-cover" />
          ) : (
            <UserCircle className="w-full h-full text-zinc-400" />
          )}
        </button>
      </div>

      <nav className="flex flex-col gap-4 w-full px-3">
        {apps.map((app) => {
          const Icon = app.icon;
          const isActive = activeApp === app.id;
          return (
            <button
              key={app.id}
              onClick={() => setActiveApp(app.id)}
              className={`relative flex items-center justify-center w-12 h-12 rounded-[14px] transition-colors focus:outline-none ${
                isActive ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/60'
              }`}
              title={app.label}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-indicator"
                  className="absolute inset-0 bg-zinc-200/60 rounded-[14px]"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <Icon size={20} className="relative z-10" strokeWidth={isActive ? 2.5 : 2} />
              {app.id === 'tasks' && taskUnreadCount > 0 && <motion.span key={taskPulseKey} initial={{ scale: 0.65 }} animate={{ scale: [1, 1.45, 1] }} transition={{ duration: 0.38, ease: 'easeOut' }} className="absolute -right-1 -top-1 z-20 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-zinc-100 bg-rose-500 px-1 text-[10px] font-bold text-white">{taskUnreadCount}</motion.span>}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto pb-2 w-full px-3 relative">
        <button 
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className={`w-12 h-12 flex items-center justify-center rounded-[14px] transition-colors focus:outline-none ${
            isUserMenuOpen ? 'text-zinc-900 bg-zinc-200/60' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/60'
          }`}
        >
          <Settings size={20} strokeWidth={2} />
        </button>

        <AnimatePresence>
          {isUserMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)} />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, x: -10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95, x: -10 }}
                className="absolute left-14 bottom-0 w-48 bg-white border border-zinc-200 shadow-lg rounded-xl overflow-hidden z-50 py-1"
              >
                <div className="px-3 py-2 border-b border-zinc-100 mb-1">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">切换角色到</span>
                </div>
                {USERS.map(user => (
                  <button
                    key={user.id}
                    onClick={() => {
                      setActiveUserId(user.id);
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-zinc-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <img src={user.avatar} alt={user.name} className="w-5 h-5 rounded-full" />
                      <span className={`text-sm ${user.id === activeUserId ? 'text-zinc-900 font-medium' : 'text-zinc-600'}`}>
                        {user.name}
                      </span>
                    </div>
                    {user.id === activeUserId && <Check size={14} className="text-indigo-600" />}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
