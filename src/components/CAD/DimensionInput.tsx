import React, { useState, useEffect } from 'react';
import { formatFeetInches, parseFeetInches } from '../../cad/geometry/FeetInches';
import { Check, X } from 'lucide-react';

interface DimensionInputProps {
  label: string;
  valueInches: number | undefined;
  onApply: (inches: number) => void;
  allowZero?: boolean;
}

export const DimensionInput: React.FC<DimensionInputProps> = ({ label, valueInches, onApply, allowZero = true }) => {
  const [inputValue, setInputValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setInputValue(formatFeetInches(valueInches || 0));
      setError(null);
    }
  }, [valueInches, isEditing]);

  const handleApply = () => {
    const parsed = parseFeetInches(inputValue);
    if (isNaN(parsed) || (!allowZero && parsed === 0) || parsed < 0) {
      setError('Invalid dimension');
      return;
    }
    
    setError(null);
    setIsEditing(false);
    
    // Only trigger update if changed to avoid unnecessary history entries
    if (parsed !== (valueInches || 0)) {
      onApply(parsed);
    } else {
      // Just reformat text
      setInputValue(formatFeetInches(parsed));
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setInputValue(formatFeetInches(valueInches || 0));
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      handleApply();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-[11px] block">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsEditing(true);
            setError(null);
          }}
          onFocus={() => setIsEditing(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay blur to allow button clicks to register
            setTimeout(() => {
              if (isEditing) handleApply();
            }, 150);
          }}
          className={`w-full bg-slate-900 border ${error ? 'border-red-500 focus:ring-red-500' : 'border-slate-700 focus:ring-retailfix-red-500'} rounded p-1.5 text-xs text-white font-mono focus:ring-1 outline-none transition-colors`}
          placeholder="e.g. 2'-6&quot;"
        />
        
        {isEditing && (
          <div className="absolute right-1 flex items-center gap-0.5 bg-slate-900 pr-1">
            <button
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur
                handleApply();
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                handleApply();
              }}
              className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors"
              title="Apply (Enter)"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur
                handleCancel();
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                handleCancel();
              }}
              className="p-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
              title="Cancel (Esc)"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      {error && <span className="text-red-400 text-[9px] absolute">{error}</span>}
    </div>
  );
};
