import { ChatItem, DocItem, DocLibrary } from './types';

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
        title: 'FY27 财务预测',
        updatedAt: '昨天',
        author: '马库斯',
        type: 'spreadsheet',
        content: '<h1>FY27 财务预测</h1><p>本预测汇总 FY27 年度收入、成本与现金流的规划假设，供产品、研发和运营团队对齐资源投入节奏。</p><h3>年度目标</h3><ul><li>年度营收目标：2,400 万元，同比增长 28%。</li><li>毛利率目标：保持在 62% 以上。</li><li>经营现金流：第四季度实现稳定转正。</li></ul><h3>关键假设</h3><p>企业版续约率预计维持在 91%，下半年新增两项行业解决方案，并将核心产品交付周期缩短至 6 周。</p><h3>风险与关注项</h3><ul><li>重点关注核心客户续约及回款节奏。</li><li>新增研发投入需与产品路线图里程碑同步复核。</li></ul>',
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
