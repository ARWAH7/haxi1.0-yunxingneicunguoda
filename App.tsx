
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, RotateCcw, Settings, X, Loader2, ShieldCheck, AlertCircle, RefreshCw, BarChart3, PieChart, Plus, Trash2, Edit3, Grid3X3, LayoutDashboard } from 'lucide-react';
import { BlockData, IntervalRule } from './types';
import { fetchLatestBlock, fetchBlockByNum, transformTronBlock } from './utils/helpers';
import TrendChart from './components/TrendChart';
import BeadRoad from './components/BeadRoad';
import DataTable from './components/DataTable';

type TabType = 'dashboard' | 'parity-trend' | 'size-trend' | 'parity-bead' | 'size-bead';

const DEFAULT_RULES: IntervalRule[] = [
  { id: '1', label: '单区块', value: 1, startBlock: 0 },
  { id: '20', label: '20区块', value: 20, startBlock: 0 },
  { id: '60', label: '60区块', value: 60, startBlock: 0 },
  { id: '100', label: '100区块', value: 100, startBlock: 0 },
];

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('tron_api_key') || '');
  const [showSettings, setShowSettings] = useState(() => !localStorage.getItem('tron_api_key'));
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [rules, setRules] = useState<IntervalRule[]>(() => {
    const saved = localStorage.getItem('interval_rules');
    return saved ? JSON.parse(saved) : DEFAULT_RULES;
  });
  const [activeRuleId, setActiveRuleId] = useState<string>(rules[0].id);
  
  const [editingRule, setEditingRule] = useState<IntervalRule | null>(null);
  const [allBlocks, setAllBlocks] = useState<BlockData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const blocksRef = useRef<BlockData[]>([]);
  const isPollingBusy = useRef(false);

  useEffect(() => {
    blocksRef.current = allBlocks;
    localStorage.setItem('interval_rules', JSON.stringify(rules));
  }, [allBlocks, rules]);

  const activeRule = useMemo(() => 
    rules.find(r => r.id === activeRuleId) || rules[0]
  , [rules, activeRuleId]);

  const checkAlignment = (height: number, rule: IntervalRule) => {
    if (rule.value <= 1) return true;
    if (rule.startBlock > 0) {
      return height >= rule.startBlock && (height - rule.startBlock) % rule.value === 0;
    }
    return height % rule.value === 0;
  };

  const displayBlocks = useMemo(() => {
    const filtered = allBlocks.filter(b => checkAlignment(b.height, activeRule));
    if (searchQuery) {
      return filtered.filter(b => 
        b.height.toString().includes(searchQuery) || 
        b.hash.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return filtered;
  }, [allBlocks, activeRule, searchQuery]);

  const saveApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    if (!trimmed) return;
    localStorage.setItem('tron_api_key', trimmed);
    setApiKey(trimmed);
    setShowSettings(false);
    setError(null);
    setAllBlocks([]);
  }, []);

  const fillDataForInterval = useCallback(async (rule: IntervalRule) => {
    if (!apiKey) return;
    setIsLoading(true);
    setError(null);
    try {
      const latestRaw = await fetchLatestBlock(apiKey);
      const latest = transformTronBlock(latestRaw);
      
      let currentHeight = latest.height;
      if (rule.value > 1) {
        if (rule.startBlock > 0) {
          const diff = currentHeight - rule.startBlock;
          currentHeight = rule.startBlock + Math.floor(diff / rule.value) * rule.value;
        } else {
          currentHeight = Math.floor(currentHeight / rule.value) * rule.value;
        }
      }

      const count = 100;
      const targetHeights: number[] = [];
      for (let i = 0; i < count; i++) {
        const h = currentHeight - (i * rule.value);
        if (h > 0 && (rule.startBlock === 0 || h >= rule.startBlock)) {
          targetHeights.push(h);
        }
      }

      const results: BlockData[] = [];
      for (const num of targetHeights) {
        try {
          const b = await fetchBlockByNum(num, apiKey);
          results.push(b);
        } catch (e) {
          console.error(`Fetch error:`, e);
        }
      }

      setAllBlocks(prev => {
        const combined = [...results, ...prev];
        const uniqueMap = new Map();
        for (const b of combined) {
          if (!uniqueMap.has(b.height)) uniqueMap.set(b.height, b);
        }
        return Array.from(uniqueMap.values())
          .sort((a, b) => b.height - a.height)
          .slice(0, 3000);
      });
    } catch (err: any) {
      setError("数据同步异常，请检查 TronGrid API Key。");
    } finally {
      setIsLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    if (apiKey && displayBlocks.length < 50 && !isLoading) {
      fillDataForInterval(activeRule);
    }
  }, [activeRuleId, apiKey, fillDataForInterval]);

  useEffect(() => {
    if (!apiKey || isLoading) return;
    const poll = async () => {
      if (isPollingBusy.current || document.hidden) return;
      isPollingBusy.current = true;
      try {
        const latestRaw = await fetchLatestBlock(apiKey);
        const latest = transformTronBlock(latestRaw);
        const currentTopHeight = blocksRef.current[0]?.height || 0;
        if (latest.height > currentTopHeight) {
          setIsSyncing(true);
          const newBlocks: BlockData[] = [];
          for (let h = currentTopHeight + 1; h <= latest.height; h++) {
            try {
              const b = await fetchBlockByNum(h, apiKey);
              newBlocks.push(b);
            } catch (e) {}
          }
          if (newBlocks.length > 0) {
            setAllBlocks(prev => {
              const combined = [...newBlocks, ...prev];
              const uniqueMap = new Map();
              for (const b of combined) {
                if (!uniqueMap.has(b.height)) uniqueMap.set(b.height, b);
              }
              return Array.from(uniqueMap.values())
                .sort((a, b) => b.height - a.height)
                .slice(0, 3000); 
            });
          }
          setIsSyncing(false);
        }
      } finally {
        isPollingBusy.current = false;
      }
    };
    const pollingId = window.setInterval(poll, 3000);
    return () => clearInterval(pollingId);
  }, [apiKey, isLoading]);

  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    if (rules.find(r => r.id === editingRule.id)) {
      setRules(prev => prev.map(r => r.id === editingRule.id ? editingRule : r));
    } else {
      setRules(prev => [...prev, editingRule]);
    }
    setEditingRule(null);
  };

  const deleteRule = (id: string) => {
    if (rules.length <= 1) return;
    setRules(prev => prev.filter(r => r.id !== id));
    if (activeRuleId === id) setActiveRuleId(rules[0].id);
  };

  const TABS = [
    { id: 'dashboard', label: '综合盘面', icon: LayoutDashboard, color: 'text-blue-500' },
    { id: 'parity-trend', label: '单双走势', icon: BarChart3, color: 'text-red-500' },
    { id: 'size-trend', label: '大小走势', icon: PieChart, color: 'text-indigo-500' },
    { id: 'parity-bead', label: '单双珠盘', icon: Grid3X3, color: 'text-teal-500' },
    { id: 'size-bead', label: '大小珠盘', icon: Grid3X3, color: 'text-orange-500' },
  ] as const;

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 pb-24 min-h-screen antialiased">
      <header className="mb-6 flex flex-col items-center">
        <div className="w-full flex justify-between items-center mb-6">
          <div className="w-10"></div>
          <h1 className="text-2xl md:text-4xl font-black text-blue-600 tracking-tight text-center">
            哈希实时分析 <span className="text-gray-300 font-light mx-2">|</span> <span className="text-gray-400">路图大盘</span>
          </h1>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-3 bg-white shadow-sm border border-gray-100 hover:bg-gray-50 rounded-2xl transition-all text-gray-500 active:scale-95"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>
        
        <p className="bg-white px-5 py-2 rounded-full shadow-sm border border-gray-50 text-gray-400 text-[10px] font-black items-center flex uppercase tracking-widest">
          <ShieldCheck className="w-3.5 h-3.5 mr-2 text-green-500" />
          波场主网实时监听中
        </p>
      </header>

      {/* Main Tab Navigation */}
      <div className="flex justify-center mb-8 sticky top-4 z-[40]">
        <div className="inline-flex bg-white/80 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-white/50 w-full max-w-4xl overflow-x-auto no-scrollbar">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-xs md:text-sm font-black transition-all duration-300 whitespace-nowrap ${
                  isActive ? 'bg-blue-600 text-white shadow-lg scale-105' : 'text-gray-400 hover:bg-gray-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : tab.color}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Interval Navigation */}
      <div className="flex flex-col items-center mb-8 overflow-hidden">
        <nav className="flex justify-center flex-wrap gap-2 md:gap-3 mb-4 w-full px-2">
          {rules.map((rule) => (
            <button
              key={rule.id}
              onClick={() => setActiveRuleId(rule.id)}
              className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all duration-300 border-2 whitespace-nowrap ${
                activeRuleId === rule.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                  : 'bg-white text-gray-400 border-transparent hover:border-blue-100 hover:text-blue-500'
              }`}
            >
              {rule.label}
              {rule.value > 1 && <span className="ml-2 opacity-50 text-[10px]">/{rule.value}</span>}
            </button>
          ))}
          <button 
            onClick={() => setEditingRule({ id: Date.now().toString(), label: '自定义', value: 10, startBlock: 0 })}
            className="px-5 py-2.5 rounded-xl text-xs font-black bg-gray-50 text-gray-400 border-2 border-dashed border-gray-200 hover:bg-white hover:border-blue-200 hover:text-blue-500 transition-all"
          >
            + 规则
          </button>
        </nav>
      </div>

      {/* Main View Area */}
      <div className="mb-12">
        {activeTab === 'dashboard' ? (
          /* DASHBOARD VIEW: 2x2 Grid */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12 animate-in fade-in zoom-in-95 duration-500">
            <div className="h-[280px] md:h-[320px]">
              <TrendChart blocks={displayBlocks} mode="parity" title="单双走势 (大路)" />
            </div>
            <div className="h-[280px] md:h-[320px]">
              <TrendChart blocks={displayBlocks} mode="size" title="大小走势 (大路)" />
            </div>
            <div className="h-[280px] md:h-[320px]">
              <BeadRoad blocks={displayBlocks} mode="parity" title="单双珠盘路" />
            </div>
            <div className="h-[280px] md:h-[320px]">
              <BeadRoad blocks={displayBlocks} mode="size" title="大小珠盘路" />
            </div>
          </div>
        ) : (
          /* DETAILED VIEW: Single Large Module */
          <div className="bg-white rounded-[2.5rem] p-6 md:p-10 shadow-xl border border-gray-100 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center space-x-3 mb-8 px-2">
               <div className="p-2 bg-blue-50 rounded-xl">
                 {activeTab.includes('parity') ? <BarChart3 className="w-6 h-6 text-red-500" /> : <PieChart className="w-6 h-6 text-indigo-500" />}
               </div>
               <h2 className="text-xl md:text-2xl font-black text-gray-800">
                {TABS.find(t => t.id === activeTab)?.label} 深度分析
              </h2>
            </div>
            <div className="h-[450px]">
              {activeTab === 'parity-trend' && <TrendChart blocks={displayBlocks} mode="parity" title="单双走势 (全量统计)" />}
              {activeTab === 'size-trend' && <TrendChart blocks={displayBlocks} mode="size" title="大小走势 (全量统计)" />}
              {activeTab === 'parity-bead' && <BeadRoad blocks={displayBlocks} mode="parity" title="单双珠盘 (原始序列)" />}
              {activeTab === 'size-bead' && <BeadRoad blocks={displayBlocks} mode="size" title="大小珠盘 (原始序列)" />}
            </div>
          </div>
        )}

        {/* Global Data Controls & Table (Universal) */}
        <div className="mt-12 space-y-6">
          <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <div className="flex-1 w-full relative group">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索区块号、哈希值..."
                className="w-full pl-6 pr-14 py-4 rounded-2xl bg-gray-50 border-0 focus:outline-none focus:ring-4 focus:ring-blue-50 transition-all text-sm font-medium"
              />
              <Search className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 group-focus-within:text-blue-400 transition-colors" />
            </div>
            <button 
              onClick={() => {setSearchQuery(''); fillDataForInterval(activeRule);}} 
              className="w-full md:w-auto flex items-center justify-center px-10 py-4 bg-gray-100 text-gray-500 rounded-2xl border border-gray-200 hover:bg-gray-200 transition-all active:scale-95"
            >
              <RotateCcw className="w-5 h-5 mr-2" />
              <span className="text-xs font-black uppercase">强制刷新</span>
            </button>
          </div>
          <DataTable blocks={displayBlocks} />
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-10 relative animate-in zoom-in-95 duration-200">
            <button onClick={() => setShowSettings(false)} className="absolute top-10 right-10 p-2 hover:bg-gray-100 rounded-full text-gray-400">
              <X className="w-6 h-6" />
            </button>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-black text-gray-900">核心配置</h2>
              <p className="text-gray-500 text-sm mt-2">管理 API 与采样逻辑</p>
            </div>
            <div className="space-y-8">
              <section className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-3 tracking-[0.2em] ml-2">TRONGRID API KEY</label>
                <div className="flex gap-4">
                  <input
                    type="text"
                    defaultValue={apiKey}
                    id="api-key-input"
                    className="flex-1 px-6 py-4 rounded-2xl bg-white border-2 border-transparent focus:border-blue-500 outline-none transition-all font-mono text-sm"
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById('api-key-input') as HTMLInputElement;
                      saveApiKey(input.value);
                    }}
                    className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-sm active:scale-95 transition-all"
                  >
                    保存
                  </button>
                </div>
              </section>
              <section>
                <div className="flex justify-between items-center mb-4 px-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">采样规则</label>
                  <button 
                    onClick={() => setEditingRule({ id: Date.now().toString(), label: '新规则', value: 10, startBlock: 0 })}
                    className="text-blue-600 flex items-center text-xs font-black hover:underline"
                  >
                    <Plus className="w-3 h-3 mr-1" /> 新增
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {rules.map(r => (
                    <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex justify-between items-center group hover:shadow-md transition-all">
                      <div>
                        <p className="font-black text-sm text-gray-800">{r.label}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">间隔: {r.value} | 起始: {r.startBlock || '0'}</p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingRule(r)} className="p-2 text-gray-400 hover:text-blue-600 transition-colors"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => deleteRule(r.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Rule Editor Modal */}
      {editingRule && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-8 animate-in slide-in-from-bottom-4 duration-300">
            <h3 className="text-xl font-black mb-6 text-gray-800">编辑采样规则</h3>
            <form onSubmit={handleSaveRule} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">规则名称</label>
                <input 
                  required
                  value={editingRule.label}
                  onChange={e => setEditingRule({...editingRule, label: e.target.value})}
                  className="w-full px-5 py-3 rounded-xl bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">区块步长</label>
                  <input 
                    type="number" min="1" required
                    value={editingRule.value}
                    onChange={e => setEditingRule({...editingRule, value: parseInt(e.target.value) || 1})}
                    className="w-full px-5 py-3 rounded-xl bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">起始区块</label>
                  <input 
                    type="number" min="0" placeholder="0"
                    value={editingRule.startBlock || ''}
                    onChange={e => setEditingRule({...editingRule, startBlock: parseInt(e.target.value) || 0})}
                    className="w-full px-5 py-3 rounded-xl bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setEditingRule(null)} className="flex-1 py-3 font-black text-sm text-gray-400 hover:bg-gray-50 rounded-xl transition-all">取消</button>
                <button type="submit" className="flex-1 py-3 font-black text-sm bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 active:scale-95 transition-all">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-8 bg-red-50 border-l-8 border-red-500 p-6 rounded-2xl flex items-start text-red-700 shadow-sm animate-in fade-in duration-300">
          <AlertCircle className="w-6 h-6 mr-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-black text-sm mb-1 uppercase tracking-wider">连接异常</h4>
            <p className="text-xs font-medium opacity-80">{error}</p>
          </div>
          <button onClick={() => fillDataForInterval(activeRule)} className="ml-4 px-5 py-2.5 bg-red-100 rounded-xl text-xs font-black uppercase hover:bg-red-200 transition-colors">重新同步</button>
        </div>
      )}

      {/* Lightweight Initial Loading Indicator (Only for heavy load) */}
      {isLoading && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-white/60 backdrop-blur-sm pointer-events-none">
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl flex flex-col items-center border border-gray-100 animate-in zoom-in-90 duration-200">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
            <span className="text-xs font-black text-gray-500 uppercase tracking-[0.3em]">正在初始化大盘数据...</span>
          </div>
        </div>
      )}

      {/* Floating Status Bar (Minimalist) */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-500 opacity-90 hover:opacity-100">
        <div className="bg-white/95 backdrop-blur-xl shadow-2xl rounded-full px-8 py-4 border border-gray-100 flex items-center space-x-6">
          <div className="flex items-center space-x-2.5">
            <div className="relative flex h-3 w-3">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${apiKey && !error ? 'animate-ping bg-green-400' : 'bg-red-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${apiKey && !error ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </div>
            <span className="text-[10px] font-black text-gray-800 uppercase tracking-widest">
              {apiKey && !error ? '实时同步中' : '离线状态'}
            </span>
          </div>
          {isSyncing && (
            <div className="flex items-center space-x-2 border-l border-gray-100 pl-6">
              <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
              <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">正在捕获新区块</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
