
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, RotateCcw, Settings, X, Loader2, ShieldCheck, AlertCircle, RefreshCw, BarChart3, PieChart, Plus, Trash2, Edit3 } from 'lucide-react';
import { BlockData, IntervalRule } from './types';
import { fetchLatestBlock, fetchBlockByNum, transformTronBlock } from './utils/helpers';
import TrendChart from './components/TrendChart';
import DataTable from './components/DataTable';

type ViewType = 'parity' | 'size';

const DEFAULT_RULES: IntervalRule[] = [
  { id: '1', label: '单区块', value: 1, startBlock: 0 },
  { id: '20', label: '20区块', value: 20, startBlock: 0 },
  { id: '60', label: '60区块', value: 60, startBlock: 0 },
  { id: '100', label: '100区块', value: 100, startBlock: 0 },
];

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('tron_api_key') || '');
  const [showSettings, setShowSettings] = useState(() => !localStorage.getItem('tron_api_key'));
  const [rules, setRules] = useState<IntervalRule[]>(() => {
    const saved = localStorage.getItem('interval_rules');
    return saved ? JSON.parse(saved) : DEFAULT_RULES;
  });
  const [activeRuleId, setActiveRuleId] = useState<string>(rules[0].id);
  const [activeView, setActiveView] = useState<ViewType>('parity');
  
  // Rule Editor State
  const [editingRule, setEditingRule] = useState<IntervalRule | null>(null);
  
  // Main Data Set
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

  // Specialized alignment check supporting start block offset
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

      const count = 30; // Fetch 30 points for trend
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
          .slice(0, 2000);
      });
    } catch (err: any) {
      setError("请求同步失败，请检查网络或 API Key 状态。");
    } finally {
      setIsLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    if (apiKey && displayBlocks.length < 15 && !isLoading) {
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

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-8 pb-24 min-h-screen antialiased">
      <header className="mb-6 flex flex-col items-center">
        <div className="w-full flex justify-between items-center mb-6">
          <div className="w-10"></div>
          <h1 className="text-3xl md:text-4xl font-black text-blue-600 tracking-tight text-center">
            哈希走势大盘 <span className="text-gray-300 font-light mx-2">|</span> <span className="text-gray-400">高级配置版</span>
          </h1>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-3 bg-white shadow-sm border border-gray-100 hover:bg-gray-50 rounded-2xl transition-all text-gray-500 active:scale-95"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100 mb-6 w-full max-w-sm">
          <button
            onClick={() => setActiveView('parity')}
            className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-xl text-sm font-black transition-all duration-300 ${
              activeView === 'parity' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>单双走势</span>
          </button>
          <button
            onClick={() => setActiveView('size')}
            className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-xl text-sm font-black transition-all duration-300 ${
              activeView === 'size' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'
            }`}
          >
            <PieChart className="w-4 h-4" />
            <span>大小走势</span>
          </button>
        </div>

        <p className="bg-white px-5 py-2 rounded-full shadow-sm border border-gray-50 text-gray-400 text-[10px] uppercase tracking-[0.25em] font-black flex items-center">
          <ShieldCheck className="w-3.5 h-3.5 mr-2 text-green-500" />
          波场主网实时协议已验证
        </p>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-10 relative animate-in zoom-in-95 duration-200">
            <button onClick={() => setShowSettings(false)} className="absolute top-10 right-10 p-2 hover:bg-gray-100 rounded-full text-gray-400">
              <X className="w-6 h-6" />
            </button>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-black text-gray-900">全局配置</h2>
              <p className="text-gray-500 text-sm mt-2">管理 API 连接与自定义采样规则</p>
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
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">采样规则管理</label>
                  <button 
                    onClick={() => setEditingRule({ id: Date.now().toString(), label: '新规则', value: 10, startBlock: 0 })}
                    className="text-blue-600 flex items-center text-xs font-black hover:underline"
                  >
                    <Plus className="w-3 h-3 mr-1" /> 添加自定义规则
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {rules.map(r => (
                    <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex justify-between items-center group hover:shadow-md transition-all">
                      <div>
                        <p className="font-black text-sm text-gray-800">{r.label}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">间隔: {r.value} | 起始: {r.startBlock || '默认'}</p>
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
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">区块间隔</label>
                  <input 
                    type="number" min="1" required
                    value={editingRule.value}
                    onChange={e => setEditingRule({...editingRule, value: parseInt(e.target.value) || 1})}
                    className="w-full px-5 py-3 rounded-xl bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">起始高度</label>
                  <input 
                    type="number" min="0" placeholder="0 (自动)"
                    value={editingRule.startBlock || ''}
                    onChange={e => setEditingRule({...editingRule, startBlock: parseInt(e.target.value) || 0})}
                    className="w-full px-5 py-3 rounded-xl bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setEditingRule(null)} className="flex-1 py-3 font-black text-sm text-gray-400 hover:bg-gray-50 rounded-xl transition-all">取消</button>
                <button type="submit" className="flex-1 py-3 font-black text-sm bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 active:scale-95 transition-all">保存规则</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-10 bg-red-50 border-l-8 border-red-500 p-6 rounded-2xl flex items-start text-red-700 shadow-sm animate-in fade-in duration-300">
          <AlertCircle className="w-6 h-6 mr-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-black text-sm mb-1 uppercase tracking-wider">连接受阻</h4>
            <p className="text-xs font-medium opacity-80">{error}</p>
          </div>
          <button onClick={() => fillDataForInterval(activeRule)} className="ml-4 px-5 py-2.5 bg-red-100 rounded-xl text-xs font-black uppercase hover:bg-red-200 transition-colors">重连</button>
        </div>
      )}

      {/* Interval Navigation */}
      <div className="flex flex-col items-center mb-10 overflow-hidden">
        <nav className="flex justify-center flex-wrap gap-2 md:gap-3 mb-4 w-full px-2">
          {rules.map((rule) => (
            <button
              key={rule.id}
              onClick={() => setActiveRuleId(rule.id)}
              className={`px-6 py-3 rounded-2xl text-xs md:text-sm font-black transition-all duration-300 border-2 whitespace-nowrap ${
                activeRuleId === rule.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xl scale-105 z-10'
                  : 'bg-white text-gray-400 border-transparent hover:border-blue-50 hover:text-blue-500'
              }`}
            >
              {rule.label}
              {rule.value > 1 && <span className="ml-2 opacity-50 text-[10px]">/{rule.value}</span>}
            </button>
          ))}
          <button 
            onClick={() => setEditingRule({ id: Date.now().toString(), label: '自定义', value: 10, startBlock: 0 })}
            className="px-6 py-3 rounded-2xl text-xs font-black bg-gray-50 text-gray-400 border-2 border-dashed border-gray-200 hover:bg-white hover:border-blue-200 hover:text-blue-500 transition-all"
          >
            + 自定义
          </button>
        </nav>
        {activeRule.startBlock > 0 && (
          <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">
            起始点锁定: #{activeRule.startBlock}
          </p>
        )}
      </div>

      <div className="space-y-8 mb-12">
        <div className="relative">
          {(isLoading || isSyncing) && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/40 backdrop-blur-[2px] rounded-3xl transition-all">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center border border-gray-100">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">{isLoading ? '初始化' : '同步中'}</span>
              </div>
            </div>
          )}
          <TrendChart blocks={displayBlocks} mode={activeView} />
        </div>
      </div>

      {/* Search & Utility */}
      <div className="flex flex-col md:flex-row items-center gap-5 my-10 bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm">
        <div className="flex-1 w-full relative group">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="在当前采样的区块中搜索高度或 Hash..."
            className="w-full pl-7 pr-16 py-5 rounded-[1.5rem] bg-gray-50 border-0 focus:outline-none focus:ring-4 focus:ring-blue-50 transition-all text-sm font-medium"
          />
          <Search className="absolute right-7 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 group-focus-within:text-blue-400 transition-colors" />
        </div>
        <button onClick={() => {setSearchQuery(''); fillDataForInterval(activeRule);}} className="flex-1 md:flex-none flex items-center justify-center px-10 py-5 bg-gray-100 text-gray-400 rounded-[1.5rem] hover:bg-gray-200 transition-all active:scale-95">
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>

      <DataTable blocks={displayBlocks} />

      {/* Status HUD */}
      <div className="fixed bottom-10 right-10 z-50 pointer-events-none">
        <div className="bg-white/95 backdrop-blur-md shadow-2xl rounded-[1.8rem] px-8 py-5 border border-gray-100 flex items-center space-x-5 transition-all">
          <div className="relative flex h-3.5 w-3.5">
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${apiKey && !error ? 'animate-ping bg-green-400' : 'bg-red-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${apiKey && !error ? 'bg-green-500' : 'bg-red-500'}`}></span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest leading-none mb-1.5">主网监控</span>
            <span className="text-[11px] font-black text-gray-800 flex items-center">
              {apiKey && !error ? (isSyncing ? '数据同步中' : '实时监听中') : '未授权'}
              {isSyncing && <RefreshCw className="w-3 h-3 ml-3 animate-spin text-blue-500" />}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
