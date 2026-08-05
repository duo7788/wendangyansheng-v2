import { useEffect, useState } from 'react';
import { Phone, Video, MoreHorizontal, Paperclip, Smile, Send, FileText } from 'lucide-react';
import { ChatItem, AppIdentifier, Message } from '../../types';
import { USERS } from '../../App';

interface ChatWorkspaceProps {
  chat: ChatItem;
  activeUserId: string;
  setActiveApp: (app: AppIdentifier) => void;
  setActiveItemId: (id: string | null) => void;
  onSendMessage: (chatId: string, content: string) => void;
  onMarkChatRead: (chatId: string, viewerId: string) => void;
}

export function ChatWorkspace({ chat, activeUserId, setActiveApp, setActiveItemId, onSendMessage, onMarkChatRead }: ChatWorkspaceProps) {
  const [draft, setDraft] = useState('');
  const activeUser = USERS.find(u => u.id === activeUserId);
  
  // Just for demonstration, if messages are empty, we can mock the default conversation.
  const defaultMessages: Message[] = [
    {
      id: 'm1',
      senderId: chat.user.id,
      content: '嗨！你昨天有空看我上传的最新线框图吗？我们需要确定一下间距规范。',
      timestamp: '昨天',
      type: 'text' as const
    },
    {
      id: 'm2',
      senderId: 'u_jobs',
      content: '看了，非常棒。新的间距让一切都显得更有呼吸感了。我晚点会在 Figma 里留一些小的修改建议。',
      timestamp: '昨天',
      type: 'text' as const
    },
    {
      id: 'm3',
      senderId: chat.user.id,
      content: chat.lastMessage,
      timestamp: chat.timestamp,
      type: 'text' as const
    }
  ];

  const messages = (chat.messages && chat.messages.length > 0 ? chat.messages : defaultMessages)
    .filter(message => message.type !== 'shared_doc' || !message.recipientId || message.senderId === activeUserId || message.recipientId === activeUserId);
  const latestMessage = [...messages].reverse()[0];
  const partnerId = latestMessage
    ? latestMessage.senderId === activeUserId
      ? latestMessage.recipientId || chat.user.id
      : latestMessage.senderId
    : chat.user.id === activeUserId
      ? 'u_jobs'
      : chat.user.id;
  const otherUser = USERS.find(user => user.id === partnerId) || chat.user;
  const send = () => {
    const content = draft.trim();
    if (!content) return;
    onSendMessage(chat.id, content);
    setDraft('');
  };

  useEffect(() => {
    onMarkChatRead(chat.id, activeUserId);
  }, [activeUserId, chat.id, onMarkChatRead]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <header className="h-[72px] shrink-0 border-b border-zinc-100 px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src={otherUser.avatar} alt={otherUser.name} className="w-10 h-10 rounded-full object-cover" />
          <div>
            <h2 className="text-base font-semibold text-zinc-900">{otherUser.name}</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${otherUser.status === 'online' ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
              <span className="text-xs text-zinc-500">{otherUser.status === 'online' ? '在线' : otherUser.status === 'offline' ? '离线' : '忙碌'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-full transition-colors">
            <Phone size={18} />
          </button>
          <button className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-full transition-colors">
            <Video size={18} />
          </button>
          <div className="w-px h-5 bg-zinc-200 mx-1" />
          <button className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-full transition-colors">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-6">
        <div className="flex items-center justify-center mb-4">
          <span className="text-xs font-medium text-zinc-400 bg-zinc-50 px-3 py-1 rounded-full border border-zinc-100">今天</span>
        </div>
        
        {messages.map((msg, index) => {
          const isMe = msg.senderId === activeUserId;
          const sender = USERS.find(user => user.id === msg.senderId);
          const senderAvatar = sender?.avatar || (isMe ? activeUser?.avatar : otherUser.avatar);

          return (
            <div key={msg.id} className={`flex gap-4 max-w-[80%] ${isMe ? 'ml-auto justify-end' : ''}`}>
              {!isMe && <img src={senderAvatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 mt-auto" />}
              
              {msg.type === 'shared_doc' ? (
                <div className={`px-4 py-3 rounded-2xl ${isMe ? 'bg-blue-600 rounded-br-sm' : 'bg-zinc-100/80 rounded-bl-sm'}`}>
                  <p className={`text-sm mb-3 ${isMe ? 'text-blue-50' : 'text-zinc-600'}`}>{msg.content}</p>
                  <div className={`p-4 rounded-xl border flex flex-col gap-3 ${isMe ? 'bg-white/10 border-white/20' : 'bg-white border-zinc-200'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${isMe ? 'bg-white/20' : 'bg-indigo-50 text-indigo-600'}`}>
                        <FileText size={20} className={isMe ? 'text-white' : ''} />
                      </div>
                      <div>
                        <h4 className={`text-sm font-semibold ${isMe ? 'text-white' : 'text-zinc-900'}`}>{msg.docTitle}</h4>
                        <span className={`text-xs ${isMe ? 'text-blue-100' : 'text-zinc-500'}`}>由 {sender?.name || otherUser.name} 共享</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        if (msg.docId) {
                          setActiveApp('docs');
                          setActiveItemId(msg.docId);
                        }
                      }}
                      className={`w-full py-2 flex items-center justify-center text-sm font-medium rounded-lg transition-colors ${
                      isMe 
                        ? 'bg-white text-blue-600 hover:bg-blue-50' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}>
                      查看文档
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`px-4 py-3 rounded-2xl ${isMe ? 'bg-blue-600 rounded-br-sm text-white' : 'bg-zinc-100/80 rounded-bl-sm'}`}>
                  <p className={`text-sm leading-relaxed ${isMe ? 'text-white' : 'text-zinc-800'}`}>
                    {msg.content}
                  </p>
                </div>
              )}
              
              {isMe && <img src={senderAvatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 mt-auto" />}
            </div>
          );
        })}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-zinc-100">
        <div className="flex items-end gap-2 bg-zinc-50 border border-zinc-200/80 rounded-2xl p-2 transition-all focus-within:bg-white focus-within:border-zinc-300 focus-within:shadow-sm">
          <button className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors shrink-0 rounded-full hover:bg-zinc-200/50">
            <Paperclip size={20} />
          </button>
          <textarea
            placeholder="输入消息..."
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            className="flex-1 max-h-32 min-h-[40px] bg-transparent resize-none outline-none py-2 px-2 text-sm text-zinc-800 placeholder:text-zinc-400"
            rows={1}
          />
          <button className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors shrink-0 rounded-full hover:bg-zinc-200/50">
            <Smile size={20} />
          </button>
          <button onClick={send} aria-label="发送消息" className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors shrink-0 shadow-sm ml-1">
            <Send size={18} className="ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
