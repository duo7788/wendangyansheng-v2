import { ChatItem, DocComment, DocItem, DocLibrary } from './types';

export const mockComments: DocComment[] = [
  {
    id: 'comment-seeded-1', docId: 'd1', roleId: 'backend', authorId: 'u_jobs', recipientId: 'u1',
    selectedText: '跨 React 和 Figma 的组件库一致性。', sourceText: '跨 React 和 Figma 的组件库一致性。',
    content: '这里需要先确定接口字段的归属，后端是否需要提供组件版本信息？', createdAt: '上午 09:30',
    replies: [{ id: 'reply-seeded-1', authorId: 'u1', content: '需要。我会在接口说明里补充版本与兼容性字段。', createdAt: '上午 10:12' }],
  },
  {
    id: 'comment-seeded-2', docId: 'd1', roleId: 'qa', authorId: 'u4', recipientId: 'u_jobs',
    selectedText: 'WCAG AA 无障碍标准合规性审计。', sourceText: 'WCAG AA 无障碍标准合规性审计。',
    content: '验收标准里是否要明确键盘操作和对比度的边界？', createdAt: '昨天',
    replies: [{ id: 'reply-seeded-2', authorId: 'u_jobs', content: '是的，请按常见交互控件补一份验收清单。', createdAt: '昨天 16:40' }],
  },
  {
    id: 'comment-seeded-3', docId: 'd2', roleId: 'frontend', authorId: 'u_jobs', recipientId: 'u2',
    selectedText: 'FY24 财务预测', sourceText: 'FY24 财务预测', content: '表格的导出字段是否需要按权限隐藏敏感预测数据？', createdAt: '昨天 14:20',
    replies: [{ id: 'reply-seeded-3', authorId: 'u2', content: '需要，我会在前端增加受限字段的展示状态。', createdAt: '昨天 15:06' }],
  },
  {
    id: 'comment-seeded-4', docId: 'd3', roleId: 'qa', authorId: 'u4', recipientId: 'u_jobs',
    selectedText: '客户入职指南', sourceText: '客户入职指南', content: '新客户首次登录失败时，是否需要补充人工支持入口？', createdAt: '周二',
    replies: [{ id: 'reply-seeded-4', authorId: 'u_jobs', content: '需要，先在帮助区提供工单与人工咨询入口。', createdAt: '周二 16:20' }],
  },
  {
    id: 'comment-seeded-5', docId: 'd5', roleId: 'backend', authorId: 'u1', recipientId: 'u_jobs',
    selectedText: 'Q4 全员大会演示文稿', sourceText: 'Q4 全员大会演示文稿', content: '演示数据要使用实时统计，还是采用发布前冻结的数据？', createdAt: '上周五', status: 'resolved', resolvedById: 'u_jobs',
    replies: [{ id: 'reply-seeded-5', authorId: 'u_jobs', content: '使用发布前冻结的数据，避免现场波动。', createdAt: '上周五 17:10' }],
  },
];

export const mockChats: ChatItem[] = [
  {
    id: 'c1',
    user: {
      id: 'u1',
      name: '陈莎莎 (后端)',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      status: 'online',
    },
    lastMessage: 'Q3营销物料已经准备好审核了。',
    timestamp: '上午 10:42',
    unreadCount: 2,
  },
  {
    id: 'c2',
    user: {
      id: 'u2',
      name: '马库斯 (前端)',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      status: 'busy',
    },
    lastMessage: '晚点能开个简短的同步会吗？',
    timestamp: '上午 09:15',
    unreadCount: 0,
  },
  {
    id: 'c3',
    user: {
      id: 'u3',
      name: '设计团队',
      avatar: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      status: 'online',
    },
    lastMessage: '亚历克斯：我已经上传了最新的线框图。',
    timestamp: '昨天',
    unreadCount: 0,
  },
  {
    id: 'c4',
    user: {
      id: 'u4',
      name: '艾琳娜 (测试)',
      avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      status: 'offline',
    },
    lastMessage: '感谢更新！',
    timestamp: '星期二',
    unreadCount: 0,
  },
];

export const mockLibraries: DocLibrary[] = [
  {
    id: 'lib1',
    name: '产品设计组',
    docs: [
      {
        id: 'd1',
        title: 'Q3 产品路线图',
        updatedAt: '2小时前',
        author: '陈莎莎',
        type: 'document',
      },
      {
        id: 'd4',
        title: '品牌资产 2.0',
        updatedAt: '10月10日',
        author: '设计团队',
        type: 'folder',
      },
    ]
  },
  {
    id: 'lib2',
    name: '财务与运营',
    docs: [
      {
        id: 'd2',
        title: 'FY24 财务预测',
        updatedAt: '昨天',
        author: '马库斯',
        type: 'spreadsheet',
      },
    ]
  },
  {
    id: 'lib3',
    name: '客户成功部',
    docs: [
      {
        id: 'd3',
        title: '客户入职指南',
        updatedAt: '10月12日',
        author: '艾琳娜',
        type: 'document',
      },
      {
        id: 'd5',
        title: 'Q4 全员大会演示文稿',
        updatedAt: '10月5日',
        author: '陈莎莎',
        type: 'presentation',
      },
    ]
  }
];
