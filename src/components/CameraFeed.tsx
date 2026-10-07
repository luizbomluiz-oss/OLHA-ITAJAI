import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs'; // Required for cocoSsd
import { 
  Camera, 
  AlertCircle, 
  Play, 
  Square, 
  UserPlus, 
  BadgeInfo, 
  Cpu, 
  RefreshCw, 
  Maximize2, 
  Minimize2, 
  Sliders, 
  ArrowRight, 
  ArrowLeft, 
  ArrowDown, 
  ArrowUp, 
  ArrowLeftRight, 
  ArrowUpDown,
  Move,
  GripHorizontal,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Scan
} from 'lucide-react';
import { cn } from '../utils';

interface CameraFeedProps {
  id: string;
  title: string;
  type: 'geral' | 'cracha';
  onDetect: (blob: Blob, confidence: number, camId: string) => void;
  description: string;
  currentCount: number;
  onManualAdjust: (camId: string, delta: number) => void;
  defaultDeviceIndex?: number;
}

type FlowOrientation = 'vertical' | 'horizontal';
type FlowDirection = 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top' | 'both';

interface CrossingEvent {
  x: number;
  y: number;
  time: number;
  id: number;
}

export function CameraFeed({ 
  id, 
  title, 
  type, 
  onDetect, 
  description, 
  currentCount, 
  onManualAdjust,
  defaultDeviceIndex 
}: CameraFeedProps) {
  const defaultIndex = defaultDeviceIndex ?? (id === 'cam2' || type === 'cracha' ? 1 : 0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAutoSimulating, setIsAutoSimulating] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isRefreshingDevices, setIsRefreshingDevices] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Flow Line (Tripwire) state for Camera 1 (Top View)
  const [flowOrientation, setFlowOrientation] = useState<FlowOrientation>('vertical');
  const [flowDirection, setFlowDirection] = useState<FlowDirection>('left-to-right');
  const [linePositionPercent, setLinePositionPercent] = useState<number>(50); // 10% - 90%
  const [isDraggingLine, setIsDraggingLine] = useState(false);
  const [showFlowSettings, setShowFlowSettings] = useState(false);

  const userManuallySelectedRef = useRef<boolean>(false);
  const requestRef = useRef<number>();
  const simulateIntervalRef = useRef<number>();
  
  // Tracking state
  const trackersRef = useRef<Map<number, { 
    centroid: { x: number, y: number }; 
    trail: { x: number, y: number }[]; 
    lastSeen: number; 
    lastCounted: number; 
  }>>(new Map());
  const nextTrackerIdRef = useRef<number>(1);
  const recentCrossingsRef = useRef<CrossingEvent[]>([]);

  // Keep ref of line configuration for detect loop
  const flowConfigRef = useRef({
    orientation: flowOrientation,
    direction: flowDirection,
    positionPercent: linePositionPercent
  });

  useEffect(() => {
    flowConfigRef.current = {
      orientation: flowOrientation,
      direction: flowDirection,
      positionPercent: linePositionPercent
    };
  }, [flowOrientation, flowDirection, linePositionPercent]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen toggle failed:", err);
    }
  };

  // Enumerate devices helper
  const enumerateAndSetDevices = useCallback(async (requestPermission = false) => {
    setIsRefreshingDevices(true);
    try {
      if (requestPermission && navigator.mediaDevices?.getUserMedia) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
          tempStream.getTracks().forEach(t => t.stop());
        } catch (e) {
          console.warn("Permission check skipped or denied", e);
        }
      }

      if (navigator.mediaDevices?.enumerateDevices) {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
        setDevices(videoDevices);
        
        if (videoDevices.length > 0) {
          setSelectedDeviceId(current => {
            if (userManuallySelectedRef.current && current && videoDevices.some(d => d.deviceId === current)) {
              return current;
            }
            const target = videoDevices[defaultIndex] || videoDevices[0];
            return target.deviceId;
          });
        }
      }
    } catch (err) {
      console.error("Error enumerating devices:", err);
    } finally {
      setIsRefreshingDevices(false);
    }
  }, [defaultIndex]);

  // Initial enumeration & listen for updates
  useEffect(() => {
    enumerateAndSetDevices();
    
    const handleDeviceChange = () => enumerateAndSetDevices();
    const handleGlobalUpdate = () => enumerateAndSetDevices();

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    window.addEventListener('camera-devices-updated', handleGlobalUpdate);

    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
      window.removeEventListener('camera-devices-updated', handleGlobalUpdate);
    };
  }, [enumerateAndSetDevices]);

  // Load COCO-SSD Model
  useEffect(() => {
    let mounted = true;
    const loadModel = async () => {
      setIsLoadingModel(true);
      try {
        const loadedModel = await cocoSsd.load();
        if (mounted) {
          setModel(loadedModel);
        }
      } catch (err) {
        console.error("Failed to load model:", err);
      } finally {
        if (mounted) setIsLoadingModel(false);
      }
    };
    loadModel();
    return () => { mounted = false; };
  }, []);

  const startStream = async (deviceIdToUse?: string) => {
    setCameraError(null);
    const targetDeviceId = deviceIdToUse || selectedDeviceId;

    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const currentStream = videoRef.current.srcObject as MediaStream;
        currentStream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }

      let stream: MediaStream;
      const videoConstraints: MediaTrackConstraints = targetDeviceId 
        ? { deviceId: { exact: targetDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };
      
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints
        });
      } catch (e) {
        if (targetDeviceId) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: targetDeviceId }
          });
        } else {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error);
          setIsStreaming(true);
          detectFrame();
        };
      }

      window.dispatchEvent(new CustomEvent('camera-devices-updated'));
    } catch (err: any) {
      console.warn("Camera access failed:", err?.message || err?.name);
      let errorMsg = "Não foi possível acessar a câmera. Verifique as permissões.";
      if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = "Esta câmera já está sendo usada por outra lente ou aplicativo. Selecione outro dispositivo acima.";
      } else if (err.name === 'NotFoundError' || err?.message?.includes('device not found')) {
        errorMsg = "Câmera selecionada não foi encontrada. Clique no botão de atualizar.";
      } else if (err.name === 'NotAllowedError') {
        errorMsg = "Permissão de câmera negada no navegador.";
      }
      setCameraError(errorMsg);
    }
  };

  const stopStream = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setIsAutoSimulating(false);
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    if (simulateIntervalRef.current) window.clearInterval(simulateIntervalRef.current);
    
    // Clear canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleDeviceChange = (newDeviceId: string) => {
    userManuallySelectedRef.current = true;
    setSelectedDeviceId(newDeviceId);
    if (isStreaming) {
      startStream(newDeviceId);
    }
  };

  const captureAndDetect = useCallback((manualConfidence: number = 0.95) => {
    if (!isStreaming && cameraError) {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = type === 'geral' ? '#0B3C6D' : '#D97706';
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText('Detecção Simulada', 220, 240);
        canvas.toBlob((blob) => {
          if (blob) {
            onDetect(blob, manualConfidence, id);
          }
        }, 'image/jpeg', 0.8);
      }
      return;
    }

    if (!videoRef.current || !isStreaming) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          onDetect(blob, manualConfidence, id);
        }
      }, 'image/jpeg', 0.8);
    }
  }, [cameraError, id, isStreaming, onDetect, type]);

  // Direct Interactive Dragging on Video Viewport
  const updateLineFromPointer = useCallback((clientX: number, clientY: number) => {
    if (!videoContainerRef.current) return;
    const rect = videoContainerRef.current.getBoundingClientRect();
    if (flowOrientation === 'vertical') {
      const relativeX = clientX - rect.left;
      const pct = Math.round((relativeX / rect.width) * 100);
      const clampedPct = Math.max(8, Math.min(92, pct));
      setLinePositionPercent(clampedPct);
    } else {
      const relativeY = clientY - rect.top;
      const pct = Math.round((relativeY / rect.height) * 100);
      const clampedPct = Math.max(8, Math.min(92, pct));
      setLinePositionPercent(clampedPct);
    }
  }, [flowOrientation]);

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (type !== 'geral') return;
    setIsDraggingLine(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    updateLineFromPointer(clientX, clientY);
  };

  useEffect(() => {
    if (!isDraggingLine) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateLineFromPointer(e.clientX, e.clientY);
    };
    const handleMouseUp = () => {
      setIsDraggingLine(false);
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        updateLineFromPointer(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const handleTouchEnd = () => {
      setIsDraggingLine(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDraggingLine, updateLineFromPointer]);

  const detectFrame = useCallback(async () => {
    if (!model || !videoRef.current || !canvasRef.current || !isStreaming) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (video.readyState === 4 && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const predictions = await model.detect(video);
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const now = Date.now();
      const currentTrackers = trackersRef.current;
      const activeTrackerIds = new Set<number>();
      
      const { orientation, direction, positionPercent } = flowConfigRef.current;
      const isVertical = orientation === 'vertical';
      const tripwirePos = isVertical 
        ? canvas.width * (positionPercent / 100) 
        : canvas.height * (positionPercent / 100);

      predictions.forEach(prediction => {
        if (prediction.class === 'person') {
          const [x, y, width, height] = prediction.bbox;
          const centroidX = x + width / 2;
          const centroidY = y + height / 2;
          
          let bestMatchId = -1;
          let minDistance = 160;
          
          currentTrackers.forEach((tracker, trackerId) => {
            const dx = tracker.centroid.x - centroidX;
            const dy = tracker.centroid.y - centroidY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < minDistance) {
              minDistance = distance;
              bestMatchId = trackerId;
            }
          });
          
          let assignedId = bestMatchId;
          
          if (bestMatchId !== -1) {
            const tracker = currentTrackers.get(bestMatchId)!;
            const prevX = tracker.centroid.x;
            const prevY = tracker.centroid.y;
            
            // Append trail for trajectory line
            tracker.trail.push({ x: centroidX, y: centroidY });
            if (tracker.trail.length > 8) tracker.trail.shift();
            
            tracker.centroid = { x: centroidX, y: centroidY };
            tracker.lastSeen = now;
            
            if (type === 'geral') {
              // DIRECTIONAL TRIPWIRE LOGIC (Camera 1 - Top View)
              let hasCrossed = false;
              
              if (isVertical) {
                // Vertical Line (X Axis check)
                const crossedRight = (prevX < tripwirePos && centroidX >= tripwirePos);
                const crossedLeft = (prevX > tripwirePos && centroidX <= tripwirePos);
                
                if (direction === 'left-to-right' && crossedRight) hasCrossed = true;
                else if (direction === 'right-to-left' && crossedLeft) hasCrossed = true;
                else if (direction === 'both' && (crossedRight || crossedLeft)) hasCrossed = true;
              } else {
                // Horizontal Line (Y Axis check)
                const crossedDown = (prevY < tripwirePos && centroidY >= tripwirePos);
                const crossedUp = (prevY > tripwirePos && centroidY <= tripwirePos);
                
                if (direction === 'top-to-bottom' && crossedDown) hasCrossed = true;
                else if (direction === 'bottom-to-top' && crossedUp) hasCrossed = true;
                else if (direction === 'both' && (crossedDown || crossedUp)) hasCrossed = true;
              }
              
              if (hasCrossed) {
                // Throttle per person ID (min 2.5s between counts)
                if (now - tracker.lastCounted > 2500) {
                  tracker.lastCounted = now;
                  recentCrossingsRef.current.push({
                    x: centroidX,
                    y: centroidY,
                    time: now,
                    id: assignedId
                  });
                  captureAndDetect(prediction.score);
                }
              }
            }
          } else {
            // New Person detected
            assignedId = nextTrackerIdRef.current++;
            currentTrackers.set(assignedId, {
              centroid: { x: centroidX, y: centroidY },
              trail: [{ x: centroidX, y: centroidY }],
              lastSeen: now,
              lastCounted: 0
            });
            
            if (type === 'cracha') {
              if (Math.random() > 0.4) {
                captureAndDetect(prediction.score);
              }
            }
          }
          
          activeTrackerIds.add(assignedId);

          // Draw Bounding Box
          ctx.strokeStyle = type === 'geral' ? '#0B3C6D' : '#D97706';
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, width, height);

          // Draw Trajectory Trail
          const tracker = currentTrackers.get(assignedId);
          if (tracker && tracker.trail.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = type === 'geral' ? 'rgba(11, 60, 109, 0.7)' : 'rgba(217, 119, 6, 0.7)';
            ctx.lineWidth = 2;
            ctx.moveTo(tracker.trail[0].x, tracker.trail[0].y);
            for (let i = 1; i < tracker.trail.length; i++) {
              ctx.lineTo(tracker.trail[i].x, tracker.trail[i].y);
            }
            ctx.stroke();
            
            // Draw centroid dot
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(centroidX, centroidY, 4, 0, Math.PI * 2);
            ctx.fill();
          }

          // Draw ID Badge
          ctx.fillStyle = type === 'geral' ? '#0B3C6D' : '#D97706';
          const label = `ID:${assignedId} • ${Math.round(prediction.score * 100)}%`;
          ctx.font = 'bold 13px sans-serif';
          const textWidth = ctx.measureText(label).width;
          ctx.fillRect(x, Math.max(0, y - 22), textWidth + 10, 22);
          
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, x + 5, Math.max(15, y - 6));
        }
      });
      
      // Draw Tripwire (Linha Virtual de Fluxo) for Camera 1 (Top View)
      if (type === 'geral') {
        const hasRecentCrossing = recentCrossingsRef.current.some(c => now - c.time < 1000);
        
        ctx.save();
        if (isVertical) {
          // Vertical Line
          ctx.beginPath();
          ctx.moveTo(tripwirePos, 0);
          ctx.lineTo(tripwirePos, canvas.height);
          
          // Glowing effect when crossed
          if (hasRecentCrossing) {
            ctx.strokeStyle = '#10b981'; // Green Flash
            ctx.lineWidth = 6;
            ctx.shadowColor = '#10b981';
            ctx.shadowBlur = 18;
          } else {
            ctx.strokeStyle = '#ef4444'; // Red/Orange Line
            ctx.lineWidth = 4;
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 10;
          }
          
          ctx.setLineDash([14, 8]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.shadowBlur = 0;

          // Draw Direction Arrows on the line
          const arrowSteps = 4;
          for (let i = 1; i <= arrowSteps; i++) {
            const arrowY = (canvas.height / (arrowSteps + 1)) * i;
            ctx.fillStyle = hasRecentCrossing ? '#10b981' : '#ef4444';
            ctx.beginPath();
            
            if (direction === 'left-to-right') {
              ctx.moveTo(tripwirePos + 16, arrowY);
              ctx.lineTo(tripwirePos + 2, arrowY - 9);
              ctx.lineTo(tripwirePos + 2, arrowY + 9);
            } else if (direction === 'right-to-left') {
              ctx.moveTo(tripwirePos - 16, arrowY);
              ctx.lineTo(tripwirePos - 2, arrowY - 9);
              ctx.lineTo(tripwirePos - 2, arrowY + 9);
            } else {
              // Bidirectional arrows
              ctx.moveTo(tripwirePos + 14, arrowY);
              ctx.lineTo(tripwirePos + 2, arrowY - 7);
              ctx.lineTo(tripwirePos + 2, arrowY + 7);
              ctx.moveTo(tripwirePos - 14, arrowY);
              ctx.lineTo(tripwirePos - 2, arrowY - 7);
              ctx.lineTo(tripwirePos - 2, arrowY + 7);
            }
            ctx.fill();
          }

          // Line Label Header
          const badgeText = `LINHA DE FLUXO [${direction === 'left-to-right' ? '➔' : direction === 'right-to-left' ? '⬅' : '⬌'}]`;
          ctx.font = 'bold 11px sans-serif';
          const bWidth = ctx.measureText(badgeText).width;
          
          ctx.fillStyle = hasRecentCrossing ? '#10b981' : 'rgba(239, 68, 68, 0.95)';
          const badgeX = Math.min(Math.max(10, tripwirePos - bWidth / 2), canvas.width - bWidth - 20);
          ctx.fillRect(badgeX, 8, bWidth + 14, 20);
          
          ctx.fillStyle = '#ffffff';
          ctx.fillText(badgeText, badgeX + 7, 22);

        } else {
          // Horizontal Line
          ctx.beginPath();
          ctx.moveTo(0, tripwirePos);
          ctx.lineTo(canvas.width, tripwirePos);
          
          if (hasRecentCrossing) {
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 6;
            ctx.shadowColor = '#10b981';
            ctx.shadowBlur = 18;
          } else {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 4;
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 10;
          }
          
          ctx.setLineDash([14, 8]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.shadowBlur = 0;

          // Draw Direction Arrows
          const arrowSteps = 4;
          for (let i = 1; i <= arrowSteps; i++) {
            const arrowX = (canvas.width / (arrowSteps + 1)) * i;
            ctx.fillStyle = hasRecentCrossing ? '#10b981' : '#ef4444';
            ctx.beginPath();
            
            if (direction === 'top-to-bottom') {
              ctx.moveTo(arrowX, tripwirePos + 16);
              ctx.lineTo(arrowX - 9, tripwirePos + 2);
              ctx.lineTo(arrowX + 9, tripwirePos + 2);
            } else if (direction === 'bottom-to-top') {
              ctx.moveTo(arrowX, tripwirePos - 16);
              ctx.lineTo(arrowX - 9, tripwirePos - 2);
              ctx.lineTo(arrowX + 9, tripwirePos - 2);
            } else {
              ctx.moveTo(arrowX, tripwirePos + 14);
              ctx.lineTo(arrowX - 7, tripwirePos + 2);
              ctx.lineTo(arrowX + 7, tripwirePos + 2);
              ctx.moveTo(arrowX, tripwirePos - 14);
              ctx.lineTo(arrowX - 7, tripwirePos - 2);
              ctx.lineTo(arrowX + 7, tripwirePos - 2);
            }
            ctx.fill();
          }

          const badgeText = `LINHA DE FLUXO [${direction === 'top-to-bottom' ? '⬇' : direction === 'bottom-to-top' ? '⬆' : '⬍'}]`;
          ctx.font = 'bold 11px sans-serif';
          const bWidth = ctx.measureText(badgeText).width;
          
          ctx.fillStyle = hasRecentCrossing ? '#10b981' : 'rgba(239, 68, 68, 0.95)';
          ctx.fillRect(12, Math.max(8, tripwirePos - 26), bWidth + 14, 20);
          
          ctx.fillStyle = '#ffffff';
          ctx.fillText(badgeText, 19, Math.max(22, tripwirePos - 12));
        }

        // Draw active crossing flashes
        recentCrossingsRef.current.forEach(crossing => {
          const age = now - crossing.time;
          if (age < 1200) {
            const alpha = 1 - (age / 1200);
            ctx.fillStyle = `rgba(16, 185, 129, ${alpha})`;
            ctx.font = 'bold 15px sans-serif';
            ctx.fillText(`+1 ENTRADA! (ID:${crossing.id})`, crossing.x - 40, crossing.y - 15);
            
            ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(crossing.x, crossing.y, 25 * (1 + (age / 600)), 0, Math.PI * 2);
            ctx.stroke();
          }
        });
        
        ctx.restore();
      }
      
      // Filter out expired crossing flashes
      recentCrossingsRef.current = recentCrossingsRef.current.filter(c => now - c.time < 1500);

      // Cleanup stale trackers (> 1.2s outside screen)
      currentTrackers.forEach((t, tId) => {
        if (now - t.lastSeen > 1200) {
          currentTrackers.delete(tId);
        }
      });
    }
    
    requestRef.current = requestAnimationFrame(detectFrame);
  }, [model, isStreaming, type, captureAndDetect]);

  // Auto-simulate logic
  useEffect(() => {
    if (isAutoSimulating && (isStreaming || cameraError)) {
      simulateIntervalRef.current = window.setInterval(() => {
        if (Math.random() > 0.6) {
          captureAndDetect(0.88 + Math.random() * 0.11);
        }
      }, type === 'geral' ? 2500 : 7000);
    } else {
      if (simulateIntervalRef.current) window.clearInterval(simulateIntervalRef.current);
    }
    
    return () => {
      if (simulateIntervalRef.current) window.clearInterval(simulateIntervalRef.current);
    };
  }, [isAutoSimulating, isStreaming, cameraError, type, captureAndDetect]);

  return (
    <div 
      ref={containerRef}
      className={cn(
        "flex flex-col h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden",
        isFullscreen ? "p-4 bg-slate-900 border-none rounded-none fixed inset-0 z-50 justify-between" : ""
      )}
    >
      {/* Symmetrical & Aligned Header (Identical structure for both Camera 1 & Camera 2) */}
      <div className="p-3.5 border-b border-gray-100 bg-slate-50 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
              type === 'geral' ? "bg-blue-100 text-[#0B3C6D]" : "bg-amber-100 text-amber-700"
            )}>
              <Camera className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-gray-800 text-sm truncate flex items-center gap-1.5">
                {title}
              </h3>
              <p className="text-[11px] text-gray-500 truncate">{description}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={cn(
              "px-2.5 py-1 rounded-md text-xs font-black border tracking-wide",
              type === 'geral' 
                ? "bg-blue-50 border-blue-200 text-[#0B3C6D]" 
                : "bg-amber-50 border-amber-200 text-amber-800"
            )}>
              Total: {currentCount}
            </span>

            {/* Quick Adjust +/- Buttons */}
            <div className="flex items-center bg-white rounded-md border border-gray-200 p-0.5 shadow-2xs">
              <button 
                onClick={() => onManualAdjust(id, -1)} 
                className="w-6 h-6 flex items-center justify-center rounded text-xs font-bold text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors" 
                title="Subtrair 1"
              >
                -1
              </button>
              <button 
                onClick={() => onManualAdjust(id, 1)} 
                className="w-6 h-6 flex items-center justify-center rounded text-xs font-bold text-gray-600 hover:bg-emerald-50 hover:text-emerald-600 transition-colors" 
                title="Adicionar 1"
              >
                +1
              </button>
            </div>

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors shadow-2xs"
              title={isFullscreen ? "Sair da Tela Cheia" : "Modo Tela Cheia"}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Device Selector & Single Start/Stop Button Row (Identical Symmetrical Height) */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <select
              value={selectedDeviceId}
              onChange={(e) => handleDeviceChange(e.target.value)}
              className="flex-1 min-w-0 bg-white border border-gray-300 text-gray-800 rounded-lg py-1.5 px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0B3C6D] shadow-2xs truncate"
            >
              {devices.length === 0 ? (
                <option value="">Procurando câmeras...</option>
              ) : (
                devices.map((device, idx) => (
                  <option key={device.deviceId || idx} value={device.deviceId}>
                    {device.label ? device.label : `Câmera ${idx + 1} (${device.deviceId.substring(0, 8)}...)`}
                    {idx === defaultIndex ? ' (Sugerido)' : ''}
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              onClick={() => enumerateAndSetDevices(true)}
              disabled={isRefreshingDevices}
              className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-lg text-xs font-medium transition-colors flex items-center justify-center shadow-2xs disabled:opacity-50 flex-shrink-0"
              title="Buscar câmeras conectadas"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isRefreshingDevices && "animate-spin text-[#0B3C6D]")} />
            </button>
          </div>

          {/* Unified Start/Stop Button */}
          <div className="flex-shrink-0">
            {!isStreaming ? (
              <button 
                onClick={() => startStream()}
                className="py-1.5 px-3 bg-[#0B3C6D] hover:bg-[#072545] text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <Play className="w-3.5 h-3.5 fill-white" /> Iniciar
              </button>
            ) : (
              <button 
                onClick={stopStream}
                className="py-1.5 px-3 bg-red-100 hover:bg-red-200 text-red-700 border border-red-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <Square className="w-3.5 h-3.5 fill-red-700" /> Parar
              </button>
            )}
          </div>
        </div>

        {/* Feature Sub-Bar: Symmetrical on both cameras so video feeds start at the exact same baseline! */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-200/60">
          {type === 'geral' ? (
            <>
              <button 
                type="button"
                onClick={() => setShowFlowSettings(!showFlowSettings)}
                className={cn(
                  "flex items-center gap-1.5 py-1 px-2 rounded-md font-semibold text-[11px] transition-all",
                  showFlowSettings 
                    ? "bg-[#0B3C6D] text-white shadow-2xs" 
                    : "bg-blue-50 text-[#0B3C6D] hover:bg-blue-100 border border-blue-200/80"
                )}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Linha de Fluxo: <b>{linePositionPercent}%</b> ({flowOrientation === 'vertical' ? (flowDirection === 'left-to-right' ? '➔ Dir' : flowDirection === 'right-to-left' ? '⬅ Esq' : '⬌ Ambos') : (flowDirection === 'top-to-bottom' ? '⬇ Baixo' : flowDirection === 'bottom-to-top' ? '⬆ Cima' : '⬍ Ambos')})</span>
                {showFlowSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              <span className="text-[10px] text-gray-500 hidden sm:inline-flex items-center gap-1">
                <Move className="w-3 h-3 text-gray-400" /> Arraste a linha no vídeo
              </span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 py-1 px-2 bg-amber-50 text-amber-800 border border-amber-200/80 rounded-md font-semibold text-[11px]">
                <Scan className="w-3.5 h-3.5 text-amber-600" />
                <span>Leitura Automática de Crachás & Equipe</span>
              </div>
              <span className="text-[10px] text-gray-500 hidden sm:inline-flex items-center gap-1">
                Identificação em tempo real
              </span>
            </>
          )}
        </div>

        {/* Collapsible Flow Settings Panel for Camera 1 (When opened, keeps controls clean and accessible) */}
        {type === 'geral' && showFlowSettings && (
          <div className="p-2.5 bg-gradient-to-r from-blue-50 to-indigo-50/70 border border-blue-200 rounded-lg flex flex-col gap-2 text-xs text-gray-700 shadow-inner mt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-gray-600 mr-1">Direção do Fluxo:</span>
              
              <button
                type="button"
                onClick={() => {
                  setFlowOrientation('vertical');
                  setFlowDirection('left-to-right');
                }}
                className={cn(
                  "py-0.5 px-2 rounded border text-[10px] font-semibold transition-all flex items-center gap-1",
                  flowOrientation === 'vertical' && flowDirection === 'left-to-right'
                    ? "bg-[#0B3C6D] text-white border-[#0B3C6D]"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                )}
              >
                <ArrowRight className="w-3 h-3" /> Esq ➔ Dir
              </button>

              <button
                type="button"
                onClick={() => {
                  setFlowOrientation('vertical');
                  setFlowDirection('right-to-left');
                }}
                className={cn(
                  "py-0.5 px-2 rounded border text-[10px] font-semibold transition-all flex items-center gap-1",
                  flowOrientation === 'vertical' && flowDirection === 'right-to-left'
                    ? "bg-[#0B3C6D] text-white border-[#0B3C6D]"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                )}
              >
                <ArrowLeft className="w-3 h-3" /> Dir ➔ Esq
              </button>

              <button
                type="button"
                onClick={() => {
                  setFlowOrientation('horizontal');
                  setFlowDirection('top-to-bottom');
                }}
                className={cn(
                  "py-0.5 px-2 rounded border text-[10px] font-semibold transition-all flex items-center gap-1",
                  flowOrientation === 'horizontal' && flowDirection === 'top-to-bottom'
                    ? "bg-[#0B3C6D] text-white border-[#0B3C6D]"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                )}
              >
                <ArrowDown className="w-3 h-3" /> Cima ➔ Baixo
              </button>

              <button
                type="button"
                onClick={() => {
                  setFlowOrientation('horizontal');
                  setFlowDirection('bottom-to-top');
                }}
                className={cn(
                  "py-0.5 px-2 rounded border text-[10px] font-semibold transition-all flex items-center gap-1",
                  flowOrientation === 'horizontal' && flowDirection === 'bottom-to-top'
                    ? "bg-[#0B3C6D] text-white border-[#0B3C6D]"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                )}
              >
                <ArrowUp className="w-3 h-3" /> Baixo ➔ Cima
              </button>

              <button
                type="button"
                onClick={() => {
                  setFlowDirection('both');
                }}
                className={cn(
                  "py-0.5 px-2 rounded border text-[10px] font-semibold transition-all flex items-center gap-1",
                  flowDirection === 'both'
                    ? "bg-[#0B3C6D] text-white border-[#0B3C6D]"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                )}
              >
                {flowOrientation === 'vertical' ? <ArrowLeftRight className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3" />}
                Ambos
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-blue-200/50">
              <span className="text-[10px] text-gray-600 font-bold whitespace-nowrap">Posição ({linePositionPercent}%):</span>
              <input
                type="range"
                min="10"
                max="90"
                step="1"
                value={linePositionPercent}
                onChange={(e) => setLinePositionPercent(Number(e.target.value))}
                className="flex-1 accent-[#0B3C6D] cursor-pointer h-1.5 bg-blue-200 rounded-lg"
              />
              <button
                type="button"
                onClick={() => setLinePositionPercent(50)}
                className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-semibold text-gray-700 hover:bg-blue-50"
              >
                Centro
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Video Display Container: Compact Height & Strict Aspect Ratio for Perfect Multi-Cam Co-existence */}
      <div 
        ref={videoContainerRef}
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        className={cn(
          "relative w-full aspect-video max-h-[260px] sm:max-h-[300px] lg:max-h-[320px] bg-slate-950 flex items-center justify-center overflow-hidden select-none",
          isFullscreen ? "flex-1 max-h-[calc(100vh-200px)] rounded-lg my-auto" : "",
          type === 'geral' 
            ? flowOrientation === 'vertical' ? "cursor-ew-resize" : "cursor-ns-resize"
            : ""
        )}
      >
        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 bg-gray-950 z-10 px-6 text-center pointer-events-none">
            <AlertCircle className="w-9 h-9 mb-2 opacity-80" />
            <span className="text-xs font-medium">{cameraError}</span>
          </div>
        ) : !isStreaming ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-slate-950 z-10 pointer-events-none">
            <Camera className="w-10 h-10 mb-2 opacity-30 text-white" />
            <span className="text-xs font-medium text-gray-400">Câmera inativa</span>
            <span className="text-[11px] text-gray-600 mt-0.5">Clique em "Iniciar" para ativar a lente</span>
          </div>
        ) : null}
        
        {isLoadingModel && isStreaming && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/85 text-white z-20 pointer-events-none">
            <Cpu className="w-7 h-7 mb-2 animate-pulse text-amber-400" />
            <span className="text-xs font-semibold">Carregando Modelo de Visão...</span>
          </div>
        )}
        
        {/* Video with object-contain to PREVENT ANY STRETCHING */}
        <video 
          ref={videoRef}
          className="w-full h-full object-contain pointer-events-none"
          playsInline
          muted
        />
        {/* Canvas with exact matching object-contain */}
        <canvas 
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
        />

        {/* Interactive Direct Tripwire Overlay for Camera 1 */}
        {type === 'geral' && (
          <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
            {flowOrientation === 'vertical' ? (
              <div 
                className={cn(
                  "absolute top-0 bottom-0 pointer-events-auto flex flex-col justify-between items-center transition-opacity",
                  isDraggingLine ? "opacity-100" : "opacity-85 hover:opacity-100"
                )}
                style={{ 
                  left: `${linePositionPercent}%`,
                  transform: 'translateX(-50%)'
                }}
              >
                {/* Top Badge Handle */}
                <div 
                  className={cn(
                    "mt-1.5 px-2 py-0.5 rounded text-white font-bold text-[10px] shadow-lg flex items-center gap-1 cursor-grab active:cursor-grabbing border",
                    isDraggingLine ? "bg-emerald-600 border-emerald-400 scale-105" : "bg-red-600/95 border-red-400/80"
                  )}
                >
                  <GripVertical className="w-3 h-3" />
                  <span>Linha ({linePositionPercent}%)</span>
                </div>

                {/* Center Visual Grab Handle */}
                <div 
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-white shadow-xl cursor-grab active:cursor-grabbing border-2 transition-transform",
                    isDraggingLine ? "bg-emerald-600 border-white scale-125" : "bg-red-600/90 border-red-300 hover:scale-110"
                  )}
                  title="Arraste para reposicionar a linha de fluxo"
                >
                  {flowDirection === 'left-to-right' && <ArrowRight className="w-3.5 h-3.5 font-bold" />}
                  {flowDirection === 'right-to-left' && <ArrowLeft className="w-3.5 h-3.5 font-bold" />}
                  {flowDirection === 'both' && <ArrowLeftRight className="w-3.5 h-3.5 font-bold" />}
                </div>

                {/* Bottom Badge Indicator */}
                <div className="mb-1.5 px-1.5 py-0.5 rounded bg-black/75 text-white text-[9px] font-medium backdrop-blur-xs border border-white/20">
                  {flowDirection === 'left-to-right' ? '➔ Dir' : flowDirection === 'right-to-left' ? '⬅ Esq' : '⬌ Ambos'}
                </div>
              </div>
            ) : (
              <div 
                className={cn(
                  "absolute left-0 right-0 pointer-events-auto flex justify-between items-center transition-opacity",
                  isDraggingLine ? "opacity-100" : "opacity-85 hover:opacity-100"
                )}
                style={{ 
                  top: `${linePositionPercent}%`,
                  transform: 'translateY(-50%)'
                }}
              >
                {/* Left Badge Handle */}
                <div 
                  className={cn(
                    "ml-2 px-2 py-0.5 rounded text-white font-bold text-[10px] shadow-lg flex items-center gap-1 cursor-grab active:cursor-grabbing border",
                    isDraggingLine ? "bg-emerald-600 border-emerald-400 scale-105" : "bg-red-600/95 border-red-400/80"
                  )}
                >
                  <GripHorizontal className="w-3 h-3" />
                  <span>Linha ({linePositionPercent}%)</span>
                </div>

                {/* Center Visual Grab Handle */}
                <div 
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-white shadow-xl cursor-grab active:cursor-grabbing border-2 transition-transform",
                    isDraggingLine ? "bg-emerald-600 border-white scale-125" : "bg-red-600/90 border-red-300 hover:scale-110"
                  )}
                  title="Arraste para reposicionar a linha de fluxo"
                >
                  {flowDirection === 'top-to-bottom' && <ArrowDown className="w-3.5 h-3.5 font-bold" />}
                  {flowDirection === 'bottom-to-top' && <ArrowUp className="w-3.5 h-3.5 font-bold" />}
                  {flowDirection === 'both' && <ArrowUpDown className="w-3.5 h-3.5 font-bold" />}
                </div>

                {/* Right Badge Indicator */}
                <div className="mr-2 px-1.5 py-0.5 rounded bg-black/75 text-white text-[9px] font-medium backdrop-blur-xs border border-white/20">
                  {flowDirection === 'top-to-bottom' ? '⬇ Baixo' : flowDirection === 'bottom-to-top' ? '⬆ Cima' : '⬍ Ambos'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual Actions Footer (Identical Compact Height for Both Feeds) */}
      <div className={cn("p-3 bg-gray-50 flex items-center justify-between gap-3 border-t border-gray-100", isFullscreen ? "rounded-lg" : "")}>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input 
            type="checkbox" 
            checked={isAutoSimulating}
            onChange={(e) => setIsAutoSimulating(e.target.checked)}
            disabled={!isStreaming && !cameraError}
            className="rounded text-[#0B3C6D] focus:ring-[#0B3C6D] disabled:opacity-50 w-3.5 h-3.5"
          />
          <span className="text-[11px] font-medium text-gray-700">Auto-Simular</span>
        </label>
        
        <button
          onClick={() => captureAndDetect(0.99)}
          disabled={!isStreaming && !cameraError}
          className={cn(
            "py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs",
            (!isStreaming && !cameraError) ? "bg-gray-200 text-gray-400 cursor-not-allowed" :
            type === 'geral' 
              ? "bg-blue-100 hover:bg-blue-200 text-[#0B3C6D] border border-blue-200" 
              : "bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-200"
          )}
        >
          {type === 'geral' ? <UserPlus className="w-3.5 h-3.5" /> : <BadgeInfo className="w-3.5 h-3.5" />}
          {type === 'geral' ? "+1 Entrada Manual" : "+1 Crachá Manual"}
        </button>
      </div>
    </div>
  );
}
