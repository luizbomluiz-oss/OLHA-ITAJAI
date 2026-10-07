import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { HourlyData } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function exportToCSV(data: any[], filename: string) {
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

interface ReportData {
  totalGeral: number;
  totalCrachas: number;
  publicoReal: number;
  hourlyData: HourlyData[];
}

export function exportToPDF(reportData: ReportData, filename: string) {
  try {
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Header
    doc.setFontSize(18);
    doc.setTextColor(11, 60, 109); // Itajaí Navy Blue (#0B3C6D)
    doc.text("OLHA+ - Relatorio Oficial de Contagem • Municipio de Itajai", 14, 22);
    
    // Date/Time
    doc.setFontSize(10);
    doc.setTextColor(100);
    const dateStr = new Date().toLocaleString('pt-BR');
    doc.text(`Data e Hora da Emissao: ${dateStr} | Sistema OLHA+ Itajai SC`, 14, 30);
    
    // Summary Box
    doc.setFontSize(14);
    doc.setTextColor(11, 60, 109);
    doc.text("Resumo Consolidado de Publico", 14, 45);
    
    doc.setFontSize(11);
    doc.setTextColor(60);
    doc.text(`Total Bruto de Entradas (Camera 1 - Topo): ${reportData.totalGeral}`, 14, 55);
    doc.text(`Total de Funcionarios / Crachas (Camera 2 - Perfil): ${reportData.totalCrachas}`, 14, 63);
    
    // Highlight Real Public
    doc.setTextColor(11, 60, 109);
    doc.setFontSize(12);
    doc.text(`Publico Liquido de Visitantes (Auditado Oficial): ${reportData.publicoReal}`, 14, 72);
    
    // Table
    doc.setTextColor(40);
    doc.setFontSize(13);
    doc.text("Historico Detalhado por Faixa Horaria", 14, 85);
    
    const tableColumn = ["Faixa Horaria", "Entradas Brutas", "Crachas (Equipe)", "Publico Liquido"];
    const tableRows = reportData.hourlyData.map(row => [
      row.hour,
      row.geral.toString(),
      row.cracha.toString(),
      row.real.toString()
    ]);
    
    autoTable(doc, {
      startY: 90,
      head: [tableColumn],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [11, 60, 109], textColor: [255, 255, 255] }, // Itajaí Navy Blue
    });
    
    doc.save(filename);
  } catch (error) {
    console.error('Error generating PDF:', error);
  }
}

// Helper to save file via File System Access API
// (Supported in Chrome/Edge. In other browsers, we might need a fallback, 
// but since this is an AI Studio app, we assume Chrome-like environment)
export async function saveImageToDirectory(directoryHandle: any, blob: Blob, filename: string): Promise<boolean> {
  try {
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (error) {
    console.error("Error saving file to directory:", error);
    return false;
  }
}

export async function appendLogToDirectory(directoryHandle: any, logContent: string): Promise<boolean> {
  try {
    const filename = 'log_feirao_tempo_real.csv';
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
    
    // Read existing file
    let existingContent = '';
    try {
      const file = await fileHandle.getFile();
      existingContent = await file.text();
    } catch (e) {
      // Ignored if newly created
    }

    // Initialize with header if empty
    let newContent = '';
    if (!existingContent.includes('Data/Hora,Acao,Origem,ID,Total_Visitantes,Total_Crachas,Publico_Real_Liquido')) {
      newContent = 'Data/Hora,Acao,Origem,ID,Total_Visitantes,Total_Crachas,Publico_Real_Liquido\n';
    }
    
    newContent += existingContent;
    // ensure it ends with newline before appending
    if (newContent.length > 0 && !newContent.endsWith('\n')) {
      newContent += '\n';
    }
    newContent += logContent + '\n';

    const writable = await fileHandle.createWritable();
    await writable.write(newContent);
    await writable.close();
    
    return true;
  } catch (error) {
    console.error("Error appending to log file:", error);
    return false;
  }
}
