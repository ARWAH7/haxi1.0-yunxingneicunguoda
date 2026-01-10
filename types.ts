
export type BlockType = 'ODD' | 'EVEN';
export type SizeType = 'BIG' | 'SMALL';

export interface BlockData {
  height: number;
  hash: string;
  resultValue: number;
  type: BlockType;
  sizeType: SizeType;
  timestamp: string;
}

export interface IntervalRule {
  id: string;
  label: string;
  value: number;
  startBlock: number; // 0 implies alignment to absolute height
}

export type IntervalType = number;

export interface GridCell {
  type: BlockType | SizeType | null;
  value?: number;
}

export interface AppConfig {
  apiKey: string;
}
