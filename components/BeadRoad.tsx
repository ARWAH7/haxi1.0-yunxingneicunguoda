
import React, { useMemo, useRef, useEffect, memo } from 'react';
import { BlockData } from '../types';
import { calculateBeadGrid } from '../utils/helpers';

interface BeadRoadProps {
  blocks: BlockData[];
  mode: 'parity' | 'size';
  title?: string;
  rows?: number;
}

const BeadRoad: React.FC<BeadRoadProps> = memo(({ blocks, mode, title, rows = 6 }) => {
  const grid = useMemo(() => {
    return calculateBeadGrid(blocks, mode === 'parity' ? 'type' : 'sizeType', rows);
  }, [blocks, mode, rows]);

  const stats = useMemo(() => {
    if (mode === 'parity') {
      const odd = blocks.filter(b => b.type === 'ODD').length;
      return {
        labelA: '单', countA: odd, colorVarA: 'var(--color-odd)',
        labelB: '双', countB: blocks.length - odd, colorVarB: 'var(--color-even)'
      };
    } else {
      const big = blocks.filter(b => b.sizeType === 'BIG').length;
      return {
        labelA: '大', countA: big, colorVarA: 'var(--color-big)',
        labelB: '小', countB: blocks.length - big, colorVarB: 'var(--color-small)'
      };
    }
  }, [blocks, mode]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        left: containerRef.current.scrollWidth,
        behavior: 'auto'
      });
    }
  }, [grid]);

  const renderCell = (type: any, value: number | undefined, colIdx: number, rowIdx: number) => {
    if (!type) return <div key={`${colIdx}-${rowIdx}`} className="w-8 h-8 border-r border-b border-gray-100/30 shrink-0" />;
    
    const isParity = mode === 'parity';
    const label = isParity ? (type === 'ODD' ? '单' : '双') : (type === 'BIG' ? '大' : '小');
    const colorVar = isParity 
      ? (type === 'ODD' ? 'var(--color-odd)' : 'var(--color-even)')
      : (type === 'BIG' ? 'var(--color-big)' : 'var(--color-small)');

    return (
      <div 
        key={`${colIdx}-${rowIdx}`} 
        className="w-8 h-8 border-r border-b border-gray-100/30 flex items-center justify-center relative group shrink-0"
      >
        <div 
          style={{ backgroundColor: colorVar }}
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-black shadow-sm transition-transform group-hover:scale-110"
        >
          {label}
        </div>
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none font-bold whitespace-nowrap">
          {value}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100 flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center mb-3 px-1">
        <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">
          {title || (mode === 'parity' ? '单双珠盘路' : '大小珠盘路')}
        </h3>
        <div className="flex items-center space-x-3 text-[10px] font-black">
          <div className="flex items-center space-x-1.5">
            <span style={{ backgroundColor: stats.colorVarA }} className="w-4 h-4 rounded flex items-center justify-center text-white text-[9px]">{stats.labelA}</span>
            <span className="text-gray-500 tabular-nums">{stats.countA}</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span style={{ backgroundColor: stats.colorVarB }} className="w-4 h-4 rounded flex items-center justify-center text-white text-[9px]">{stats.labelB}</span>
            <span className="text-gray-500 tabular-nums">{stats.countB}</span>
          </div>
        </div>
      </div>

      <div 
        ref={containerRef}
        className="overflow-auto custom-scrollbar rounded-lg border border-gray-100 bg-gray-50/20 flex-1 min-h-0"
      >
        <div className="flex min-h-full w-max">
          {grid.map((column, colIdx) => (
            <div key={colIdx} className="flex flex-col">
              {column.map((cell, rowIdx) => renderCell(cell.type, cell.value, colIdx, rowIdx))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

BeadRoad.displayName = 'BeadRoad';

export default BeadRoad;
