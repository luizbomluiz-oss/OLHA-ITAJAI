import React from 'react';
import { cn } from '../utils';

interface OlhaPlusLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  variant?: 'dark' | 'light';
}

export function OlhaPlusIcon({ 
  className, 
  color = "#0074E4" 
}: { 
  className?: string; 
  color?: string;
}) {
  return (
    <svg 
      viewBox="0 0 100 75" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-full h-full overflow-visible", className)}
    >
      {/* Outer Upper Eyelid Arch / Crease flowing into the (+) sign */}
      <path 
        d="M 18 43 C 28 24 55 20 71 27" 
        stroke={color} 
        strokeWidth="4.5" 
        strokeLinecap="round"
      />

      {/* Plus Sign (+) Integrated at the Upper-Right */}
      <path 
        d="M 71 27 H 85 M 78 20 V 34" 
        stroke={color} 
        strokeWidth="4.5" 
        strokeLinecap="square"
      />

      {/* Main Inner Upper Eyelid Curve */}
      <path 
        d="M 15 47 C 26 31 70 31 81 47" 
        stroke={color} 
        strokeWidth="4.5" 
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Main Lower Eyelid Curve */}
      <path 
        d="M 15 47 C 26 67 70 67 81 47" 
        stroke={color} 
        strokeWidth="4.5" 
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Central Iris Circle */}
      <circle 
        cx="48" 
        cy="47" 
        r="14" 
        fill={color} 
      />

      {/* Pop White Circular Catchlight / Highlight at Top-Left of Iris */}
      <circle 
        cx="44.5" 
        cy="43" 
        r="4.2" 
        fill="#FFFFFF" 
      />
    </svg>
  );
}

export function OlhaPlusLogo({ 
  className, 
  size = 'md', 
  showText = false,
  variant = 'light'
}: OlhaPlusLogoProps) {
  const sizeClasses = {
    sm: 'w-9 h-9 p-1',
    md: 'w-11 h-11 p-1.5',
    lg: 'w-14 h-14 p-2',
    xl: 'w-20 h-20 p-2.5'
  };

  const isDark = variant === 'dark';
  const iconColor = isDark ? '#38BDF8' : '#0074E4';

  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      {/* Container matching user requested exact design */}
      <div className={cn(
        "relative rounded-xl flex items-center justify-center transition-transform hover:scale-105 shadow-md",
        isDark 
          ? "bg-[#072545] border border-blue-800/80 shadow-blue-950/40" 
          : "bg-white border border-blue-100 shadow-blue-900/10",
        sizeClasses[size]
      )}>
        <OlhaPlusIcon color={isDark ? '#38BDF8' : '#0074E4'} />
      </div>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <span className={cn(
              "text-2xl font-black tracking-tight",
              isDark ? "text-white" : "text-[#0B3C6D]"
            )}>
              OLHA
            </span>
            <span className="text-2xl font-black text-sky-500 drop-shadow-sm">+</span>
          </div>
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-wider",
            isDark ? "text-blue-300" : "text-blue-800"
          )}>
            Visão & Contagem • Itajaí
          </span>
        </div>
      )}
    </div>
  );
}
