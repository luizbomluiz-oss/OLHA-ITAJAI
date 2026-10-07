export interface DetectionEvent {
  id: string;
  timestamp: Date;
  type: 'geral' | 'cracha';
  confidence: number;
}

export interface HourlyData {
  hour: string;
  geral: number;
  cracha: number;
  real: number;
}
