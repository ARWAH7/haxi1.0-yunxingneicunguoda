
import React, { memo } from 'react';
import { BlockData } from '../types';

interface DataTableProps {
  blocks: BlockData[];
}

const DataRow = memo(({ block, isEven }: { block: BlockData; isEven: boolean }) => {
  // Pre-split timestamp to avoid doing it every render
  const timeParts = block.timestamp.split(' ');

  const handleRowClick = () => {
    window.open(`https://tronscan.io/#/block/${block.height}`, '_blank');
  };

  return (
    <tr 
      onClick={handleRowClick}
      className={`${isEven ? 'bg-white' : 'bg-[#f8faff]'} hover:bg-blue-50/50 transition-colors border-b border-gray-50 last:border-0 cursor-pointer group`}
      title={`查看区块 ${block.height} 详情`}
    >
      <td className="py-5 px-6 text-blue-600 font-black tabular-nums group-hover:underline decoration-2 underline-offset-4">
        {block.height}
      </td>
      <td className="py-5 px-6 text-gray-400 font-mono truncate text-[10px] md:text-xs">
        {block.hash}
      </td>
      <td className="py-5 px-6">
        <div className="flex items-center space-x-2">
          <span className="font-black text-gray-700 bg-gray-100 px-2 py-1 rounded-md min-w-[1.5rem] text-center">
            {block.resultValue}
          </span>
          <span className="text-gray-200">|</span>
          <span 
            style={{ backgroundColor: block.type === 'ODD' ? 'var(--color-odd)' : 'var(--color-even)' }}
            className="px-2 py-1 rounded-md text-[10px] text-white font-black"
          >
            {block.type === 'ODD' ? '单' : '双'}
          </span>
          <span 
            style={{ backgroundColor: block.sizeType === 'BIG' ? 'var(--color-big)' : 'var(--color-small)' }}
            className="px-2 py-1 rounded-md text-[10px] text-white font-black"
          >
            {block.sizeType === 'BIG' ? '大' : '小'}
          </span>
        </div>
      </td>
      <td className="py-5 px-6 text-gray-500 tabular-nums leading-snug whitespace-pre-wrap font-medium">
        {timeParts[0]}<br/>{timeParts[1]}
      </td>
    </tr>
  );
});

DataRow.displayName = 'DataRow';

const DataTable: React.FC<DataTableProps> = memo(({ blocks }) => {
  if (blocks.length === 0) {
    return (
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 py-24 text-center">
        <p className="text-gray-400 font-black uppercase tracking-widest text-xs">暂无区块数据</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse table-fixed min-w-[700px]">
          <thead className="bg-[#7888a5] text-white text-xs md:text-sm font-black uppercase tracking-wider sticky top-0 z-10">
            <tr>
              <th className="py-5 px-6 w-[20%]">区块高度</th>
              <th className="py-5 px-6 w-[35%]">区块 Hash</th>
              <th className="py-5 px-6 w-[25%]">结果分析</th>
              <th className="py-5 px-6 w-[20%]">出块时间</th>
            </tr>
          </thead>
          <tbody className="text-xs md:text-sm">
            {blocks.map((block, idx) => (
              <DataRow key={block.height} block={block} isEven={idx % 2 === 0} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

DataTable.displayName = 'DataTable';

export default DataTable;
