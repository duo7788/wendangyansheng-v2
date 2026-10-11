import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Check, ChevronDown, FileText, Folder, MessageSquare, MousePointer2, Play, Plus, RotateCcw, Search, Share2, Sparkles, UploadCloud, Users, X } from 'lucide-react';
import backendItems from './example.json';
import './intro.css';

type Scene = 'home' | 'import' | 'document' | 'roles' | 'rolesBackend' | 'rolesFrontend' | 'rolesQa' | 'custom' | 'customY' | 'customYun' | 'customPinyin' | 'customTyped' | 'ready' | 'loading' | 'cards' | 'backend' | 'backendLower' | 'citeOne' | 'citeTwo';
type Frame = { at: number; scene: Scene; cursor: [number, number]; target?: string; focus?: boolean; zoom?: number; origin?: [number, number]; click?: boolean; caption: string };

const chapters = [
  { number: '01', title: '导入文档', summary: '从完整工作台进入，把真实 PRD 放进产品。', duration: 6100, frames: [
    { at: 0, scene: 'home', cursor: [1120, 555], caption: '先看完整工作台' },
    { at: 1000, scene: 'home', cursor: [750, 415], target: '.mock-home-tile.selected', zoom: 1.27, origin: [735, 405], caption: '聚焦「导入文档」入口' },
    { at: 1900, scene: 'home', cursor: [750, 415], target: '.mock-home-tile.selected', zoom: 1.27, origin: [735, 405], click: true, caption: '点击「导入文档」' },
    { at: 2350, scene: 'import', cursor: [635, 337], target: '.mock-import-modal>button:first-of-type', zoom: 1.16, origin: [700, 390], caption: '选择预置的拜访有效性 PRD' },
    { at: 4150, scene: 'import', cursor: [635, 337], target: '.mock-import-modal>button:first-of-type', zoom: 1.16, origin: [700, 390], click: true, caption: '点击「CRM拜访增加签到等有效性校验」' },
    { at: 4650, scene: 'document', cursor: [1045, 73], caption: '文档进入产品工作台' },
  ] },
  { number: '02', title: '选择角色', summary: '一次选择后端、前端、测试，再创建运营视角。', duration: 7900, frames: [
    { at: 0, scene: 'document', cursor: [1204, 31], target: '.mock-generate', caption: '在原文页找到「角色衍生」' },
    { at: 700, scene: 'document', cursor: [1204, 31], target: '.mock-generate', click: true, caption: '点击「角色衍生」' },
    { at: 1100, scene: 'roles', cursor: [469, 289], target: '.mock-role-options button:first-child', caption: '打开角色选择' },
    { at: 2000, scene: 'roles', cursor: [469, 289], target: '.mock-role-options button:first-child', click: true, caption: '勾选后端工程师' },
    { at: 2350, scene: 'rolesBackend', cursor: [770, 272], target: '.mock-role-options button:nth-child(2)', caption: '再选择前端工程师' },
    { at: 2900, scene: 'rolesBackend', cursor: [770, 272], target: '.mock-role-options button:nth-child(2)', click: true, caption: '点击前端工程师' },
    { at: 3200, scene: 'rolesFrontend', cursor: [515, 331], target: '.mock-role-options button:nth-child(3)', caption: '最后选择测试工程师' },
    { at: 3700, scene: 'rolesFrontend', cursor: [515, 331], target: '.mock-role-options button:nth-child(3)', click: true, caption: '点击测试工程师' },
    { at: 4000, scene: 'rolesQa', cursor: [845, 83], target: '.mock-modal-subhead button', focus: true, caption: '三个角色已选，移到「新建角色」' },
    { at: 4800, scene: 'rolesQa', cursor: [845, 83], target: '.mock-modal-subhead button', focus: true, click: true, caption: '点击「新建角色」' },
    { at: 5250, scene: 'custom', cursor: [614, 324], target: '.mock-input', caption: '角色创建弹窗打开' },
    { at: 5750, scene: 'custom', cursor: [614, 324], target: '.mock-input', click: true, caption: '聚焦角色名称输入框' },
    { at: 6050, scene: 'customY', cursor: [614, 324], target: '.mock-input', caption: '输入拼音：y' },
    { at: 6250, scene: 'customYun', cursor: [614, 324], target: '.mock-input', caption: '输入拼音：yun' },
    { at: 6500, scene: 'customPinyin', cursor: [614, 324], target: '.mock-input', caption: '输入拼音：yunying' },
    { at: 7100, scene: 'customTyped', cursor: [614, 324], target: '.mock-input', caption: '确认候选词：运营' },
  ] },
  { number: '03', title: '文档衍生', summary: '生成三个角色的工作视图，打开后端版本。', duration: 6100, frames: [
    { at: 0, scene: 'ready', cursor: [790, 593], target: '.mock-modal-actions .primary', caption: '角色已选，准备生成' },
    { at: 650, scene: 'ready', cursor: [790, 593], target: '.mock-modal-actions .primary', click: true, caption: '点击「生成衍生」' },
    { at: 950, scene: 'loading', cursor: [1090, 350], caption: 'AI 角色化生成衍生文档中' },
    { at: 2950, scene: 'cards', cursor: [1138, 253], target: '.mock-role-card:first-child button', caption: '生成完成，后端版本已在列表中' },
    { at: 4050, scene: 'cards', cursor: [1138, 253], target: '.mock-role-card:first-child button', focus: true, caption: '移到后端工程师的「查看文档」' },
    { at: 4650, scene: 'cards', cursor: [1138, 253], target: '.mock-role-card:first-child button', focus: true, click: true, caption: '点击「查看文档」' },
    { at: 5100, scene: 'backend', cursor: [1138, 253], caption: '后端衍生文档打开' },
  ] },
  { number: '04', title: '逻辑溯源', summary: '点击两处引用，原文自动定位并高亮依据。', duration: 7300, frames: [
    { at: 0, scene: 'backend', cursor: [846, 292], target: 'button[aria-label="查看第一处原文引用"]', focus: true, zoom: 1.1, origin: [720, 390], caption: '关键结论后带着可点击的原文索引' },
    { at: 1050, scene: 'backend', cursor: [846, 292], target: 'button[aria-label="查看第一处原文引用"]', focus: true, click: true, zoom: 1.1, origin: [720, 390], caption: '点击第一处引用 [1]' },
    { at: 1500, scene: 'citeOne', cursor: [846, 292], target: 'button[aria-label="查看第一处原文引用"]', zoom: 1.1, origin: [720, 390], caption: '左侧自动定位并高亮适用商户原文' },
    { at: 3050, scene: 'backendLower', cursor: [880, 430], zoom: 1.08, origin: [735, 400], caption: '继续向下看后端判断逻辑' },
    { at: 4400, scene: 'backendLower', cursor: [842, 348], target: 'button[aria-label="查看第二处原文引用"]', focus: true, zoom: 1.1, origin: [720, 415], caption: '第二处判断也带有原文索引' },
    { at: 5200, scene: 'backendLower', cursor: [842, 348], target: 'button[aria-label="查看第二处原文引用"]', focus: true, click: true, zoom: 1.1, origin: [720, 415], caption: '点击第二处引用 [1]' },
    { at: 5650, scene: 'citeTwo', cursor: [842, 348], target: 'button[aria-label="查看第二处原文引用"]', zoom: 1.1, origin: [720, 415], caption: '左侧定位 3 分钟阈值并高亮' },
  ] },
] as const satisfies ReadonlyArray<{ number: string; title: string; summary: string; duration: number; frames: ReadonlyArray<Frame> }>;

const sourceQuoteOne = '其他类型商户的有效判定仍走老逻辑';
const sourceQuoteTwo = '最新签到时间与签退时间的时间差≥3min';


function MockCursor({ x, y, click, clickKey }: { x: number; y: number; click: boolean; clickKey: string }) {
  return <div className={`intro-cursor ${click ? 'is-clicking' : ''}`} style={{ left: x, top: y }} aria-hidden="true">
    <MousePointer2 size={28} fill="white" strokeWidth={1.6} />
    <span key={clickKey} className="intro-cursor-ring" />
  </div>;
}

function IconRail() {
  return <div className="mock-icon-rail"><div className="mock-avatar">乔</div><div className="mock-rail-icon"><MessageSquare size={19} /></div><div className="mock-rail-icon active"><FileText size={19} /></div><div className="mock-rail-icon"><Folder size={19} /></div><div className="mock-rail-bottom">切换角色</div></div>;
}

function MockHome({ onImport }: { onImport: () => void }) {
  return <div className="mock-app">
    <IconRail />
    <aside className="mock-directory"><div className="mock-directory-head">文档 <span>◧</span></div><div className="mock-search"><Search size={15} /> 搜索...</div><div className="mock-folder"><ChevronDown size={14} /><Folder size={15} /> 产品设计组</div><div className="mock-file"><FileText size={17} /> Q3 产品路线图</div><div className="mock-file"><FileText size={17} /> 品牌资产 2.0</div><div className="mock-folder second"><ChevronDown size={14} /><Folder size={15} /> 客户成功部</div><div className="mock-file"><FileText size={17} /> 客户入职指南</div></aside>
    <main className="mock-home-main"><div className="mock-home-heading">导入文档</div><p>选择一份预置 PRD 开始体验，或导入自己的文档</p><div className="mock-home-tiles"><div className="mock-home-tile ghost"><Sparkles size={22} /><span>查看衍生功能介绍</span></div><div className="mock-home-tile ghost"><Folder size={22} /><span>新建文档库</span></div><button className="mock-home-tile selected" onClick={onImport}><UploadCloud size={31} /><span>导入文档</span></button><div className="mock-home-tile ghost"><FileText size={22} /><span>新建文档</span></div><div className="mock-home-tile ghost"><Plus size={22} /><span>导入飞书文档链接</span></div></div><div className="mock-dots"><i className="active" /><i /><i /><i /><i /></div></main>
  </div>;
}

function SourceDocument({ highlight, lower, sourcePaneRef, firstRef, secondRef }: { highlight: 0 | 1 | 2; lower: boolean; sourcePaneRef: RefObject<HTMLDivElement | null>; firstRef: RefObject<HTMLSpanElement | null>; secondRef: RefObject<HTMLSpanElement | null> }) {
  return <div className="mock-source-pane" ref={sourcePaneRef}><div className="mock-source-content"><div className="mock-doc-chip">文档</div><h1>CRM拜访增加签到等有效性校验</h1><h2>一、需求背景-为什么做</h2><p>在商户拜访场景中，增加签到、签退、到店拍照等证据校验，让一次拜访的有效性有清楚依据。</p><h2>二、需求描述-应该怎么做</h2><p>新增拜访方式及有效性判断，支持查看拜访过程和无效原因。</p><h3>3 需求详情</h3><h3>3.1 新增拜访的完成逻辑</h3><h4>3.1.1 线下拜访</h4><p>增加BD线下拜访是否有效完成的逻辑。全部校验通过后才能算一次有效的线下拜访（仅针对未首单/复活，<span ref={firstRef} className={highlight === 1 ? 'mock-source-highlight' : ''}>{sourceQuoteOne}</span>）。</p><p>如何界定是一次拜访：以单条拜访日志提交记录为核心，提交了一次日志则视为提交了一次拜访。</p><p>如何判断某次拜访是否有效：拜访日志提交时间【前2小时】内，往前取最新的一次签到、签退、拍照记录。</p><div className="mock-rule-table"><div>时点</div><div>检验对象</div><div>校验为合格的标准</div><div>签到</div><div>定位</div><div>BD签到坐标距离商家地址坐标≤100m</div><div>签退</div><div>时间</div><div><span ref={secondRef} className={highlight === 2 ? 'mock-source-highlight' : ''}>{sourceQuoteTwo}</span></div><div>拍照</div><div>定位</div><div>照片距离商家地址≤500m</div></div><p>日志提交时，填写完成度达到100%，最近签退时间与日志提交时间差≤60min。</p><h4>3.1.2 线上拜访</h4><p>若拜访方式为线上拜访，取日志提交时间【前2小时】内最近一次通话，通话时长≥20s视为有效。</p><h3>3.2 新增签到/签退功能</h3><p>签到、签退、拍照的能力开放给所有类型商户，异常情况允许确认后记录，但有效性仍按对应规则判断。</p><div className="mock-source-mini-graphic"><div className="mock-phone"><div className="mock-phone-bar" /><div className="mock-phone-circle" /><div className="mock-phone-lines" /></div><div className="mock-phone"><div className="mock-phone-bar" /><div className="mock-phone-circle" /><div className="mock-phone-lines" /></div><div className="mock-phone"><div className="mock-phone-bar" /><div className="mock-phone-circle" /><div className="mock-phone-lines" /></div></div><h3>3.3 拜访日志与回显</h3><p>无效拜访原因有一条写一条，提交之后不可修改。</p></div></div>;
}

function DerivationDocument({ lower, highlight, onFirstCitation, onSecondCitation, derivationPaneRef, secondDerivationRef }: { lower: boolean; highlight: 0 | 1 | 2; onFirstCitation: () => void; onSecondCitation: () => void; derivationPaneRef: RefObject<HTMLDivElement | null>; secondDerivationRef: RefObject<HTMLDivElement | null> }) {
  return <div className="mock-derived-pane" ref={derivationPaneRef}><div className="mock-derived-content"><div className="mock-ai-chip"><Sparkles size={14} /> AI 衍生视图 · 后端工程师</div><h1>拜访证据与有效性校验 · 后端工程师</h1><h2>{backendItems[0].title}</h2><p className="mock-bullet">{backendItems[0].items[0].text} <button className="mock-cite" onClick={onFirstCitation} aria-label="查看第一处原文引用">[1]</button></p><p className="mock-bullet">{backendItems[0].items[1].text} <span className="mock-cite passive">[1]</span></p><div className="mock-doc-figure"><div className="mock-phone"><div className="mock-phone-bar" /><div className="mock-phone-circle" /><div className="mock-phone-lines" /></div><div className="mock-phone"><div className="mock-phone-bar" /><div className="mock-phone-circle" /><div className="mock-phone-lines" /></div><div className="mock-phone"><div className="mock-phone-bar" /><div className="mock-phone-circle" /><div className="mock-phone-lines" /></div><small>原文配图 1</small></div><div ref={secondDerivationRef}><h2>{backendItems[1].title}</h2><p className="mock-bullet">{backendItems[1].items[0].text} <button className="mock-cite" onClick={onSecondCitation} aria-label="查看第二处原文引用">[1]</button></p><p className="mock-bullet">{backendItems[1].items[1].text} <span className="mock-cite passive">[1]</span></p><p className="mock-bullet">异常签到签退允许确认后记录，但状态应保留为异常，不得因接口成功就视为有效证据。 <span className="mock-cite passive">[1]</span></p></div><div className="mock-doc-figure secondary"><div className="mock-phone"><div className="mock-phone-bar" /><div className="mock-phone-circle" /><div className="mock-phone-lines" /></div><div className="mock-phone"><div className="mock-phone-bar" /><div className="mock-phone-circle" /><div className="mock-phone-lines" /></div><small>原文配图 2</small></div></div></div>;
}

function RoleCards({ onView, loading }: { onView: () => void; loading: boolean }) {
  return <aside className="mock-role-panel"><div className="mock-panel-title">角色衍生 <X size={17} /></div>{loading ? <div className="mock-loading"><div className="mock-spinner"><Sparkles size={28} /></div><strong>AI 角色化生成衍生文档中</strong><p>正在从 PRD 提取各角色需要的工作视图</p><div className="mock-loading-track"><span /></div></div> : <div className="mock-role-list">{['后端工程师', '前端工程师', '测试工程师'].map((role, index) => <div className="mock-role-card" key={role}><div className="mock-role-icon"><Users size={19} /></div><strong>{role}</strong><p><Check size={13} /> 衍生文档已完成</p><button onClick={onView}>{index === 0 ? '查看文档' : '查看文档'}</button></div>)}</div>}</aside>;
}

function RoleModal({ scene, onNewRole, onGenerate, onSelect }: { scene: Scene; onNewRole: () => void; onGenerate: () => void; onSelect: (scene: Scene) => void }) {
  const backend = ['rolesBackend','rolesFrontend','rolesQa','custom','customTyped','ready'].includes(scene);
  const frontend = ['rolesFrontend','rolesQa','custom','customTyped','ready'].includes(scene);
  const qa = ['rolesQa','custom','customTyped','ready'].includes(scene);
  return <div className="mock-overlay"><div className="mock-role-modal"><div className="mock-modal-head"><h2>角色衍生</h2><X size={18} /></div><div className="mock-modal-subhead">角色选择（可多选）<button onClick={onNewRole}><Plus size={14} /> 新建角色</button></div><div className="mock-role-options"><button className={backend ? 'checked' : ''} onClick={() => onSelect('rolesBackend')}>后端工程师 {backend && <Check size={18} />}</button><button className={frontend ? 'checked' : ''} onClick={() => onSelect('rolesFrontend')}>前端工程师 {frontend && <Check size={18} />}</button><button className={qa ? 'checked' : ''} onClick={() => onSelect('rolesQa')}>测试工程师 {qa && <Check size={18} />}</button><button>UI设计师</button></div><div className="mock-modal-related">联合生成　<span>可关联其他文档，让不同角色看到同一需求的完整上下文</span></div><div className="mock-related-row"><FileText size={18} /> 选择关联文档 <span>⌄</span></div><div className="mock-related-row"><input type="checkbox" readOnly /> 附带项目速览</div><div className="mock-modal-actions"><button>取消</button><button className="primary" onClick={onGenerate}>生成衍生</button></div></div></div>;
}

function CustomRoleModal({ scene, onType }: { scene: Scene; onType: () => void }) {
  const inputValue = scene === 'customY' ? 'y' : scene === 'customYun' ? 'yun' : scene === 'customPinyin' ? 'yunying' : scene === 'customTyped' ? '运营' : '';
  const composing = scene === 'customPinyin';
  return <div className="mock-overlay custom"><div className="mock-role-modal behind"><div className="mock-modal-head"><h2>角色衍生</h2><X size={18} /></div><div className="mock-modal-subhead">角色选择（可多选）<span>＋ 新建角色</span></div><div className="mock-role-options"><button className="checked">后端工程师 <Check size={18} /></button><button className="checked">前端工程师 <Check size={18} /></button><button className="checked">测试工程师 <Check size={18} /></button><button>UI设计师</button></div><div className="mock-modal-actions"><button className="primary">生成衍生</button></div></div><div className="mock-custom-modal"><div className="mock-modal-head"><h2>新建角色</h2><X size={18} /></div><label>自定义角色名</label><button className="mock-input" onClick={onType}>{inputValue || <span>例如：运营</span>}{inputValue && <i className="mock-typing-caret" />}</button>{composing && <div className="mock-ime-candidate"><span>1</span> 运营 <small>按空格确认</small></div>}<label>自定义生成文档的 skill</label><div className="mock-textarea">描述该角色生成文档时需要遵循的规则或关注点...</div><div className="mock-modal-actions"><button>取消</button><button className="primary muted">新建</button></div></div></div>;
}

function MockWorkspace({ scene, onScene }: { scene: Scene; onScene: (scene: Scene) => void }) {
  const showModal = ['roles','rolesBackend','rolesFrontend','rolesQa','ready'].includes(scene);
  const showCustom = ['custom','customY','customYun','customPinyin','customTyped'].includes(scene);
  const showRight = ['loading','cards','backend','backendLower','citeOne','citeTwo'].includes(scene);
  const showDerived = ['backend','backendLower','citeOne','citeTwo'].includes(scene);
  const highlight: 0 | 1 | 2 = scene === 'citeOne' ? 1 : scene === 'citeTwo' ? 2 : 0;
  const sourcePaneRef = useRef<HTMLDivElement>(null);
  const derivedPaneRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLSpanElement>(null);
  const secondRef = useRef<HTMLSpanElement>(null);
  const secondDerivationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const moveTo = (pane: HTMLDivElement | null, target: HTMLElement | null, offset = 190) => {
      if (!pane || !target) return;
      const top = pane.scrollTop + target.getBoundingClientRect().top - pane.getBoundingClientRect().top - offset;
      pane.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    };
    if (scene === 'backend') { sourcePaneRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); derivedPaneRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }
    if (scene === 'citeOne') moveTo(sourcePaneRef.current, firstRef.current, 320);
    if (scene === 'backendLower') moveTo(derivedPaneRef.current, secondDerivationRef.current, 190);
    if (scene === 'citeTwo') moveTo(sourcePaneRef.current, secondRef.current, 290);
  }, [scene]);
  return <div className="mock-app"><IconRail /><div className="mock-workspace-main"><header className="mock-workspace-toolbar"><div className="mock-breadcrumb"><span>文档</span> / <span>产品设计组</span> / <strong>CRM拜访增加签到等有效性校验</strong>{showDerived && <> / <strong>后端工程师 · 衍生文档</strong></>}</div><div className="mock-toolbar-actions"><span className="mock-toolbar-muted">◷ 编辑于 刚刚</span><span className="mock-toolbar-muted">◷ 版本记录</span><button className="mock-share"><Share2 size={16} /> 分享</button><button className="mock-question"><MessageSquare size={16} /> 模拟质疑</button><button className="mock-generate" onClick={() => onScene('roles')}><Users size={16} /> 角色衍生</button><span className="mock-more">···</span></div></header><div className={`mock-workspace-body ${showRight ? 'with-right' : ''} ${showDerived ? 'with-derived' : ''}`}><SourceDocument highlight={highlight} lower={scene === 'backendLower' || scene === 'citeTwo'} sourcePaneRef={sourcePaneRef} firstRef={firstRef} secondRef={secondRef} />{showDerived && <DerivationDocument lower={scene === 'backendLower' || scene === 'citeTwo'} highlight={highlight} onFirstCitation={() => onScene('citeOne')} onSecondCitation={() => onScene('citeTwo')} derivationPaneRef={derivedPaneRef} secondDerivationRef={secondDerivationRef} />}{showRight && <RoleCards loading={scene === 'loading'} onView={() => onScene('backend')} />}</div></div>{showModal && <RoleModal scene={scene} onNewRole={() => onScene('custom')} onGenerate={() => { onScene('loading'); window.setTimeout(() => onScene('cards'), 2000); }} onSelect={onScene} />}{showCustom && <CustomRoleModal scene={scene} onType={() => onScene('customTyped')} />}</div>;
}

export function IntroPage({ onEnterApp }: { onEnterApp: () => void }) {
  const [chapter, setChapter] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [manualScene, setManualScene] = useState<Scene | null>(null);
  const [scale, setScale] = useState(1);
  const [emphasisVisible, setEmphasisVisible] = useState(false);
  const [targetBox, setTargetBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setEmphasisVisible(true), 1000);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) { setStarted(true); setPlaying(true); } }, { threshold: 0.26 });
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!viewportRef.current) return;
    const observer = new ResizeObserver(entries => setScale((entries[0]?.contentRect.width || 1280) / 1280));
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!started || !playing || manualScene) return;
    let raf = 0;
    const start = performance.now() - elapsedRef.current;
    const tick = (now: number) => {
      const next = Math.min(now - start, chapters[chapter].duration);
      elapsedRef.current = next;
      setElapsed(next);
      if (next >= chapters[chapter].duration) {
        if (autoAdvance && chapter < chapters.length - 1) { setChapter(index => index + 1); elapsedRef.current = 0; setElapsed(0); }
        else setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, playing, chapter, autoAdvance, manualScene]);
  const activeChapter = chapters[chapter];
  const frame = useMemo(() => [...activeChapter.frames].reverse().find(item => elapsed >= item.at) || activeChapter.frames[0], [activeChapter, elapsed]);
  const scene = manualScene || frame.scene;
  const targetSelector = 'target' in frame ? frame.target : undefined;
  useEffect(() => {
    if (!targetSelector || manualScene) { setTargetBox(null); return; }
    let raf = 0;
    const measure = () => {
      const stage = stageRef.current;
      const target = stage?.querySelector(targetSelector);
      if (stage && target) {
        const stageRect = stage.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const factor = stageRect.width / 1280;
        const next = { x: (targetRect.left - stageRect.left) / factor, y: (targetRect.top - stageRect.top) / factor, width: targetRect.width / factor, height: targetRect.height / factor };
        setTargetBox(previous => previous && Math.abs(previous.x - next.x) < .4 && Math.abs(previous.y - next.y) < .4 && Math.abs(previous.width - next.width) < .4 ? previous : next);
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [targetSelector, scene, manualScene]);
  const cursorX = targetBox ? targetBox.x + targetBox.width / 2 - 5 : frame.cursor[0];
  const cursorY = targetBox ? targetBox.y + targetBox.height / 2 - 5 : frame.cursor[1];
  const chooseChapter = (index: number) => { setChapter(index); setElapsed(0); elapsedRef.current = 0; setManualScene(null); setPlaying(true); setStarted(true); setAutoAdvance(false); };
  const setSceneManually = (next: Scene) => { setManualScene(next); setPlaying(false); };
  const replay = () => chooseChapter(chapter);
  const next = () => chooseChapter(Math.min(chapter + 1, chapters.length - 1));
  return <div className="intro-page"><header className="intro-nav"><a className="intro-brand" href="#top" aria-label="文档角色衍生助手首页"><span className="intro-brand-icon"><Sparkles size={17} /></span> 文档角色衍生助手</a></header><main id="top"><section className="intro-hero"><h1>一份 PRD，<br /><em>多种工作视角。</em></h1><p>把复杂需求翻译成后端、前端、测试与设计<span className={`intro-emphasis ${emphasisVisible ? 'is-visible' : ''}`}>更想知道<svg viewBox="0 0 140 48" preserveAspectRatio="none" aria-hidden="true"><path d="M8 25 C9 10 43 3 73 5 C110 6 131 12 133 24 C135 38 105 43 70 42 C33 41 5 34 8 25" /></svg></span>的内容。<br />每一个关键结论，都能回到原文。</p><div className="intro-hero-actions"><button className="intro-primary" onClick={onEnterApp}>进入产品 <ArrowRight size={17} /></button><a className="intro-secondary" href="https://landing-page-five-lyart-62.vercel.app/" target="_blank" rel="noopener noreferrer">详细介绍 <ArrowRight size={17} /></a></div></section><section className="intro-walkthrough" id="walkthrough" ref={sectionRef}><div className="intro-walkthrough-head"><div><span className="intro-section-eyebrow">THE WORKFLOW</span><h2>核心操作过程</h2></div></div><div className="intro-demo-grid"><nav className="intro-chapter-index" aria-label="产品亮点">{chapters.map((item, index) => <button key={item.number} className={`intro-chapter-tab ${chapter === index ? 'active' : ''}`} onClick={() => chooseChapter(index)}><span className="intro-chapter-number">{item.number}</span><span><strong>{item.title}</strong><small>{item.summary}</small></span><span className="intro-chapter-progress" style={{ transform: `scaleY(${chapter === index ? Math.max(0.03, elapsed / item.duration) : index < chapter ? 1 : 0})` }} /></button>)}</nav><div className="intro-monitor-wrap"><div className="intro-monitor"><div className="intro-monitor-bezel"><div className="intro-camera" /><div className="intro-screen-viewport" ref={viewportRef}><div className="intro-stage-fit" style={{ transform: `scale(${scale})` }}><div className="intro-stage-camera" style={{ transform: `scale(${frame.zoom || 1})`, transformOrigin: `${frame.origin?.[0] || 640}px ${frame.origin?.[1] || 360}px` }}><div className="intro-stage" ref={stageRef} role="img" aria-label={`${activeChapter.title}交互演示`}>
                    {scene === 'home' || scene === 'import' ? <MockHome onImport={() => setSceneManually('import')} /> : <MockWorkspace scene={scene} onScene={setSceneManually} />}
                    {scene === 'import' && <div className="mock-overlay"><div className="mock-import-modal"><div className="mock-modal-head"><h2>导入文档</h2><X size={18} /></div><p>选择预置 PRD，立即开始体验</p><button onClick={() => setSceneManually('document')}><FileText size={25} /><span><strong>CRM拜访增加签到等有效性校验</strong><small>签到签退、水印拍照与有效拜访判断</small></span><ArrowRight size={17} /></button><button onClick={() => setSceneManually('document')}><FileText size={25} /><span><strong>CRM8.0.7 灯塔专享速派权益</strong><small>额度校验、权益发放与来源明细</small></span><ArrowRight size={17} /></button></div></div>}
                    {targetBox && 'focus' in frame && frame.focus && <div className={`intro-target-spotlight ${frame.click ? 'is-pressed' : ''}`} style={{ left: targetBox.x - 7, top: targetBox.y - 7, width: targetBox.width + 14, height: targetBox.height + 14 }} aria-hidden="true" />}
                    <MockCursor x={cursorX} y={cursorY} click={Boolean(frame.click)} clickKey={`${chapter}-${frame.at}`} />
                  </div></div></div></div></div><div className="intro-monitor-chin"><span /></div></div><div className="intro-monitor-foot"><div><span className="intro-live-dot" /> 正在演示 · {activeChapter.number} / 04</div><strong>{frame.caption}</strong><div className="intro-playback"><button onClick={replay} aria-label="重播当前亮点"><RotateCcw size={16} /> 重播</button>{chapter < chapters.length - 1 && <button onClick={next}>下一亮点 <ArrowRight size={16} /></button>}</div></div></div></div></section></main><footer className="intro-footer"><span>文档角色衍生助手 · 一份 PRD，多种工作视角</span><a href="#top"><ArrowLeft size={14} /> 返回顶部</a></footer></div>;
}
