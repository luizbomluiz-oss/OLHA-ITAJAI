import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, FileText, FileSpreadsheet, Users, UserCheck, ShieldCheck } from 'lucide-react';
import { HourlyData } from '../types';
import { exportToCSV, exportToPDF } from '../utils';

interface DashboardProps {
  totalGeral: number;
  totalCrachas: number;
  publicoReal: number;
  hourlyData: HourlyData[];
  rawHistory: any[];
}

export function Dashboard({ totalGeral, totalCrachas, publicoReal, hourlyData, rawHistory }: DashboardProps) {
  
  const handleExportCSV = () => {
    const data = rawHistory.map(h => ({
      Timestamp: h.timestamp.toISOString(),
      Tipo: h.type === 'geral' ? 'Entrada Geral' : 'Crachá Identificado',
      Confianca: `${(h.confidence * 100).toFixed(1)}%`
    }));
    exportToCSV(data, 'feirao_historico_detalhado.csv');
  };

  const handleExportPDF = () => {
    exportToPDF(
      { totalGeral, totalCrachas, publicoReal, hourlyData },
      'feirao_relatorio_consolidado.pdf'
    );
  };

  return (
    <div className="flex flex-col gap-6 h-full" id="dashboard-report">
      {/* Top Metrics with Itajaí Colors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Geral / Topo - Itajaí Ocean Blue */}
        <div className="bg-white rounded-xl p-5 border border-blue-100 shadow-sm flex flex-col relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Users className="w-16 h-16 text-[#0B3C6D]" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#0B3C6D] mb-1 z-10">Total Geral (Câmera Topo)</span>
          <span className="text-3xl font-black text-slate-800 z-10">{totalGeral}</span>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 z-10 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0B3C6D]"></span>
            Volume bruto total de ingressos
          </div>
        </div>
        
        {/* Card 2: Crachás / Perfil - Itajaí Gold / Amber */}
        <div className="bg-white rounded-xl p-5 border border-amber-100 shadow-sm flex flex-col relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-15">
            <ShieldCheck className="w-16 h-16 text-amber-500" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1 z-10">Total Crachás (Câmera Perfil)</span>
          <span className="text-3xl font-black text-slate-800 z-10">{totalCrachas}</span>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 z-10 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            Equipe / Trabalhadores / Staff
          </div>
        </div>

        {/* Card 3: Público Líquido - Itajaí Flag Gradient (Deep Navy + Gold Accent) */}
        <div className="bg-gradient-to-br from-[#072545] via-[#0B3C6D] to-[#0D4B87] border-2 border-amber-400/60 rounded-xl p-5 shadow-md text-white flex flex-col relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-20">
            <UserCheck className="w-16 h-16 text-amber-300" />
          </div>
          <div className="flex items-center justify-between z-10 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-300">Público Real (Visitantes)</span>
            <span className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full font-bold border border-amber-400/40">
              Líquido Oficial
            </span>
          </div>
          <span className="text-4xl font-black text-white z-10">{Math.max(0, publicoReal)}</span>
          <div className="mt-4 pt-3 border-t border-white/15 text-xs text-blue-100 z-10 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
              Público auditado (Total Geral subtraído da Equipe)
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col h-[400px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800">Fluxo Horário de Público • Padrão Itajaí</h3>
          <span className="text-xs font-semibold text-slate-500">Atualização em tempo real</span>
        </div>
        <div className="flex-grow w-full h-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hourlyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line type="monotone" name="Total Bruto (Topo)" dataKey="geral" stroke="#0284C7" strokeWidth={2.5} dot={{ r: 4, fill: '#0284C7' }} activeDot={{ r: 6 }} />
              <Line type="monotone" name="Equipe (Crachás)" dataKey="cracha" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 4, fill: '#F59E0B' }} activeDot={{ r: 6 }} />
              <Line type="monotone" name="Público Líquido (Real)" dataKey="real" stroke="#0B3C6D" strokeWidth={3.5} dot={{ r: 5, fill: '#0B3C6D' }} activeDot={{ r: 7 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 mt-auto" data-html2canvas-ignore>
        <button 
          onClick={handleExportCSV}
          className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          Exportar CSV Bruto
        </button>
        <button 
          onClick={handleExportPDF}
          className="flex-1 bg-gradient-to-r from-[#0B3C6D] to-[#0D4B87] hover:from-[#082B4F] hover:to-[#0B3C6D] text-white py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm border border-amber-400/30"
        >
          <FileText className="w-4 h-4 text-amber-400" />
          Relatório Consolidado (PDF Oficial)
        </button>
      </div>
    </div>
  );
}
