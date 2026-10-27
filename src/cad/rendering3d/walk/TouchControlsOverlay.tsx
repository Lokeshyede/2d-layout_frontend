import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Zap } from 'lucide-react';

interface TouchControlsOverlayProps {
  onMove: (x: number, y: number) => void;
  onLook: (dx: number, dy: number) => void;
  onToggleSprint?: (isSprinting: boolean) => void;
}

export const TouchControlsOverlay: React.FC<TouchControlsOverlayProps> = ({
  onMove,
  onLook,
  onToggleSprint,
}) => {
  const joystickBaseRef = useRef<HTMLDivElement | null>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [isJoystickActive, setIsJoystickActive] = useState(false);
  const [isSprinting, setIsSprinting] = useState(false);

  // Active touch tracking for look
  const lastLookTouchRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const joystickTouchIdRef = useRef<number | null>(null);

  const JOYSTICK_RADIUS = 48; // Max knob displacement from center

  // --- JOYSTICK LOGIC ---
  const handleJoystickStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.changedTouches[0];
    joystickTouchIdRef.current = touch.identifier;
    setIsJoystickActive(true);
    updateKnob(touch.clientX, touch.clientY);
  }, []);

  const updateKnob = (clientX: number, clientY: number) => {
    if (!joystickBaseRef.current) return;
    const rect = joystickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    let normX = dx;
    let normY = dy;
    if (dist > JOYSTICK_RADIUS) {
      normX = (dx / dist) * JOYSTICK_RADIUS;
      normY = (dy / dist) * JOYSTICK_RADIUS;
    }

    setKnobPos({ x: normX, y: normY });

    // Output normalized vector:
    // x: right (+1), left (-1)
    // y: forward (+1), backward (-1)
    const outX = normX / JOYSTICK_RADIUS;
    const outY = -normY / JOYSTICK_RADIUS; // up on screen is forward
    onMove(outX, outY);
  };

  const handleJoystickMove = useCallback((e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchIdRef.current) {
        updateKnob(touch.clientX, touch.clientY);
        break;
      }
    }
  }, []);

  const handleJoystickEnd = useCallback((e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchIdRef.current) {
        joystickTouchIdRef.current = null;
        setIsJoystickActive(false);
        setKnobPos({ x: 0, y: 0 });
        onMove(0, 0);
        break;
      }
    }
  }, [onMove]);

  // --- SWIPE LOOK LOGIC ---
  const handleLookStart = useCallback((e: React.TouchEvent) => {
    // Avoid capturing joystick touch
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier !== joystickTouchIdRef.current && !lastLookTouchRef.current) {
        lastLookTouchRef.current = {
          id: touch.identifier,
          x: touch.clientX,
          y: touch.clientY,
        };
        break;
      }
    }
  }, []);

  const handleLookMove = useCallback((e: TouchEvent) => {
    if (!lastLookTouchRef.current) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === lastLookTouchRef.current.id) {
        const dx = touch.clientX - lastLookTouchRef.current.x;
        const dy = touch.clientY - lastLookTouchRef.current.y;
        lastLookTouchRef.current.x = touch.clientX;
        lastLookTouchRef.current.y = touch.clientY;
        onLook(dx, dy);
        break;
      }
    }
  }, [onLook]);

  const handleLookEnd = useCallback((e: TouchEvent) => {
    if (!lastLookTouchRef.current) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === lastLookTouchRef.current.id) {
        lastLookTouchRef.current = null;
        break;
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('touchmove', handleJoystickMove, { passive: true });
    window.addEventListener('touchend', handleJoystickEnd, { passive: true });
    window.addEventListener('touchcancel', handleJoystickEnd, { passive: true });

    window.addEventListener('touchmove', handleLookMove, { passive: true });
    window.addEventListener('touchend', handleLookEnd, { passive: true });
    window.addEventListener('touchcancel', handleLookEnd, { passive: true });

    return () => {
      window.removeEventListener('touchmove', handleJoystickMove);
      window.removeEventListener('touchend', handleJoystickEnd);
      window.removeEventListener('touchcancel', handleJoystickEnd);

      window.removeEventListener('touchmove', handleLookMove);
      window.removeEventListener('touchend', handleLookEnd);
      window.removeEventListener('touchcancel', handleLookEnd);
    };
  }, [handleJoystickMove, handleJoystickEnd, handleLookMove, handleLookEnd]);

  const toggleSprint = () => {
    const next = !isSprinting;
    setIsSprinting(next);
    if (onToggleSprint) onToggleSprint(next);
  };

  return (
    <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-end p-6 select-none touch-none">
      {/* Right-Side Swipe Look Surface (below top header/HUD) */}
      <div
        onTouchStart={handleLookStart}
        className="absolute top-24 right-0 w-1/2 bottom-0 pointer-events-auto"
        aria-label="Swipe to Look"
      />

      {/* Bottom Area Controls Container */}
      <div className="flex items-end justify-between w-full pointer-events-none">
        {/* Left: Virtual Joystick */}
        <div
          ref={joystickBaseRef}
          onTouchStart={handleJoystickStart}
          className={`relative w-28 h-28 rounded-full border-2 transition-colors pointer-events-auto flex items-center justify-center shadow-xl ${
            isJoystickActive
              ? 'bg-slate-900/80 border-sky-400'
              : 'bg-slate-950/60 border-slate-700/80'
          } backdrop-blur-md`}
        >
          {/* Knob */}
          <div
            className={`w-12 h-12 rounded-full border shadow-md transition-transform duration-75 flex items-center justify-center ${
              isJoystickActive
                ? 'bg-sky-500 border-sky-300 text-white'
                : 'bg-slate-700 border-slate-500 text-slate-300'
            }`}
            style={{
              transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
            }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-white/80" />
          </div>

          <span className="absolute -bottom-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            MOVE
          </span>
        </div>

        {/* Right: Sprint Toggle Button */}
        <div className="flex flex-col items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={toggleSprint}
            className={`w-13 h-13 rounded-full border flex flex-col items-center justify-center shadow-2xl transition-all ${
              isSprinting
                ? 'bg-amber-500 border-amber-300 text-slate-950 shadow-amber-500/30'
                : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:text-white backdrop-blur-md'
            }`}
          >
            <Zap className={`w-5 h-5 ${isSprinting ? 'fill-current' : ''}`} />
            <span className="text-[9px] font-bold tracking-tight">RUN</span>
          </button>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            SWIPE TO LOOK
          </span>
        </div>
      </div>
    </div>
  );
};
