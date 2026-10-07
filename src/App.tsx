import React, { useState, useEffect, useCallback } from 'react';
import { CameraFeed } from './components/CameraFeed';
import { Dashboard } from './components/Dashboard';
import { DetectionEvent, HourlyData } from './types';
import { saveImageToDirectory, appendLogToDirectory } from './utils';
import { FolderOpen, AlertTriangle } from 'lucide-react';
import { OlhaPlusLogo } from './components/OlhaPlusLogo';

export default function App() {
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [directoryHandle, setDirectoryHandle] = useState<any>(null);
  const [isIframe, setIsIframe] = useState(false);

  useEffect(() => {
    setIsIframe(window.self !== window.top);
  }, []);

  const selectDirectory = async () => {
    if (isIframe) {
      alert("Acesso Negado: A seleção de pastas locais (para auditoria) é bloqueada por segurança quando o aplicativo é visualizado dentro do painel de preview.\n\nPor favor, abra o aplicativo em uma NOVA GUIA (clicando no ícone de 'Open in new tab' no canto superior direito) para utilizar esta funcionalidade.");
      return;
    }
    
    try {
      if ('showDirectoryPicker' in window) {
        const handle = await (window as any).showDirectoryPicker({
          mode: 'readwrite'
        });
        setDirectoryHandle(handle);
      } else {
        alert("Seu navegador não suporta o File System Access API (tente usar o Chrome ou Edge para salvar arquivos localmente).");
      }
    } catch (err: any) {
      console.error("Error selecting directory:", err);
      if (err.name !== 'AbortError') {
        alert("Erro ao selecionar o diretório: " + err.message);
      }
    }
  };

  const handleDetection = useCallback(async (blob: Blob, confidence: number, typeId: string) => {
    const timestamp = new Date();
    const id = Math.random().toString(36).substring(2, 9);
    const type = typeId === 'cam1' ? 'geral' : 'cracha';
    
    // Update state and append log
    setEvents(prev => {
      const newEvents = [...prev, { id, timestamp, type, confidence }];
      if (directoryHandle) {
        const newGeral = newEvents.filter(e => e.type === 'geral').length;
        const newCrachas = newEvents.filter(e => e.type === 'cracha').length;
        const timeStr = timestamp.toLocaleString('pt-BR');
        const cameraName = type === 'geral' ? 'Camera 1 (Visao Superior)' : 'Camera 2 (Perfil)';
        const logLine = `"${timeStr}","IA Detectou","${cameraName}","${id}",${newGeral},${newCrachas},${Math.max(0, newGeral - newCrachas)}`;
        appendLogToDirectory(directoryHandle, logLine).catch(console.error);
      }
      return newEvents;
    });

    // Save image if directory is selected
    if (directoryHandle) {
      const timeStr = timestamp.toISOString().replace(/[:.]/g, '-');
      const filename = `CAM_${type.toUpperCase()}_${timeStr}_${id}.jpg`;
      await saveImageToDirectory(directoryHandle, blob, filename);
    }
  }, [directoryHandle]);

  const handleManualAdjust = useCallback((typeId: string, delta: number) => {
    const type = typeId === 'cam1' ? 'geral' : 'cracha';
    const timestamp = new Date();
    const id = Math.random().toString(36).substring(2, 9);
    
    setEvents(prev => {
      let newEvents = [...prev];
      if (delta === 1) {
        newEvents.push({ id, timestamp, type, confidence: 1 });
      } else if (delta === -1) {
        const reversed = [...prev].reverse();
        const index = reversed.findIndex(e => e.type === type);
        if (index !== -1) {
          reversed.splice(index, 1);
          newEvents = reversed.reverse();
        }
      }
      
      if (directoryHandle && newEvents.length !== prev.length) {
        const newGeral = newEvents.filter(e => e.type === 'geral').length;
        const newCrachas = newEvents.filter(e => e.type === 'cracha').length;
        const timeStr = timestamp.toLocaleString('pt-BR');
        const cameraName = type === 'geral' ? 'Camera 1 (Visao Superior)' : 'Camera 2 (Perfil)';
        const actionName = delta === 1 ? 'Ajuste Manual (+1)' : 'Ajuste Manual (-1)';
        const logLine = `"${timeStr}","${actionName}","${cameraName}","${id}",${newGeral},${newCrachas},${Math.max(0, newGeral - newCrachas)}`;
        appendLogToDirectory(directoryHandle, logLine).catch(console.error);
      }
      
      return newEvents;
    });
  }, [directoryHandle]);

  // Derived state
  const totalGeral = events.filter(e => e.type === 'geral').length;
  const totalCrachas = events.filter(e => e.type === 'cracha').length;
  const publicoReal = Math.max(0, totalGeral - totalCrachas);

  // Calculate Hourly Data
  const hourlyData: HourlyData[] = React.useMemo(() => {
    const hourMap = new Map<string, { geral: number, cracha: number }>();
    
    // Seed with current hour and previous hours if empty just for empty state visual
    const now = new Date();
    for(let i=3; i>=0; i--) {
      const h = new Date(now.getTime() - i * 60 * 60 * 1000);
      const label = `${h.getHours().toString().padStart(2, '0')}:00`;
      hourMap.set(label, { geral: 0, cracha: 0 });
    }

    events.forEach(event => {
      const h = event.timestamp.getHours().toString().padStart(2, '0') + ':00';
      if (!hourMap.has(h)) {
        hourMap.set(h, { geral: 0, cracha: 0 });
      }
      const data = hourMap.get(h)!;
      if (event.type === 'geral') data.geral++;
      else data.cracha++;
    });

    return Array.from(hourMap.entries()).map(([hour, data]) => ({
      hour,
      geral: data.geral,
      cracha: data.cracha,
      real: Math.max(0, data.geral - data.cracha)
    })).sort((a, b) => a.hour.localeCompare(b.hour));
  }, [events]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header with Itajaí Colors */}
      <header className="bg-gradient-to-r from-[#072545] via-[#0B3C6D] to-[#0D4B87] border-b-2 border-amber-400 sticky top-0 z-50 shadow-md">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <OlhaPlusLogo size="md" variant="dark" />
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-2xl font-black tracking-tight text-white leading-none">OLHA</h1>
                  <span className="text-2xl font-black text-amber-400 leading-none drop-shadow-sm">+</span>
                  <span className="ml-2 hidden sm:inline-block px-2 py-0.5 bg-blue-900/80 border border-amber-400/40 rounded-full text-[10px] font-bold text-amber-300 tracking-wider">
                    ITAJAÍ • SC
                  </span>
                </div>
                <p className="text-[10px] font-bold text-blue-200 uppercase tracking-wider mt-0.5">
                  Visão Computacional & Contagem Inteligente
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={selectDirectory}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all shadow-sm ${
                  directoryHandle 
                    ? 'bg-amber-400 text-blue-950 border border-amber-300 hover:bg-amber-300' 
                    : 'bg-white/10 text-white border border-white/20 hover:bg-white/20'
                }`}
              >
                <FolderOpen className="w-4 h-4 text-amber-300" />
                {directoryHandle ? 'Pasta Auditada Ativa' : 'Selecionar Pasta Logs'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Warnings */}
      {isIframe && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="max-w-[1600px] mx-auto flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <strong className="font-semibold">Atenção:</strong> Você está visualizando o aplicativo em um iframe. 
              Recursos como acesso à câmera local e seleção de pasta (File System Access API) podem estar bloqueados por segurança. 
              Recomendamos abrir em uma nova guia para testar todas as funcionalidades.
            </div>
          </div>
        </div>
      )}
      
      {!directoryHandle && (
        <div className="bg-blue-950/5 border-b border-blue-900/10 px-4 py-2">
          <div className="max-w-[1600px] mx-auto flex items-center gap-2 text-xs text-[#0B3C6D]">
            <span>Para habilitar o <strong>Salvamento Local de Imagens & Auditoria Contínua em Tempo Real</strong>, clique em "Selecionar Pasta Logs" e escolha a pasta desejada no seu computador.</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-8">
          
          {/* Cameras Row */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            <div className="flex flex-col">
              <CameraFeed 
                id="cam1" 
                title="Câmera 1 (Visão Superior)" 
                type="geral"
                description="Contabiliza o volume bruto de pessoas que ingressam no evento."
                currentCount={totalGeral}
                onDetect={handleDetection} 
                onManualAdjust={handleManualAdjust}
                defaultDeviceIndex={0}
              />
            </div>
            
            <div className="flex flex-col">
              <CameraFeed 
                id="cam2" 
                title="Câmera 2 (Visão Perfil)" 
                type="cracha"
                description="Leitura visual de crachás da equipe de organização."
                currentCount={totalCrachas}
                onDetect={handleDetection} 
                onManualAdjust={handleManualAdjust}
                defaultDeviceIndex={1}
              />
            </div>
          </div>

          {/* Dashboard Row */}
          <div>
            <Dashboard 
              totalGeral={totalGeral}
              totalCrachas={totalCrachas}
              publicoReal={publicoReal}
              hourlyData={hourlyData}
              rawHistory={events}
            />
          </div>

        </div>
      </main>
    </div>
  );
}
