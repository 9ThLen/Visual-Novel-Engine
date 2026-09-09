import { useState, useCallback, useRef, useEffect } from 'react';

function charDelayMs(textSpeed: number): number {
  const clamped = Math.max(0, Math.min(1, textSpeed));
  return Math.round(60 - clamped * 48);
}

export function useTypewriter(textSpeed: number) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typewriterRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idxRef = useRef(0);
  const currentTarget = useRef('');
  // Mirror textSpeed into a ref so the running timer reads the latest value
  // without restarting. A new value takes effect on the very next character.
  const textSpeedRef = useRef(textSpeed);

  // Reschedule the pending tick when textSpeed changes mid-typing. Without
  // this, the originally-scheduled setTimeout would still fire with the old
  // delay, defeating the purpose of the live ref read.
  useEffect(() => {
    textSpeedRef.current = textSpeed;
    if (!typewriterRef.current) return;
    if (idxRef.current <= 0) return; // No progress yet — startTypewriter will pick up the new value
    const target = currentTarget.current;
    if (!target) return;

    clearTimeout(typewriterRef.current);
    const scheduleNext = () => {
      typewriterRef.current = setTimeout(() => {
        idxRef.current++;
        setDisplayedText(target.slice(0, idxRef.current));
        if (idxRef.current >= target.length) {
          typewriterRef.current = null;
          setIsTyping(false);
          return;
        }
        scheduleNext();
      }, charDelayMs(textSpeedRef.current));
    };
    scheduleNext();
  }, [textSpeed]);

  const startTypewriter = useCallback((text: string) => {
    if (typewriterRef.current) {
      clearTimeout(typewriterRef.current);
      typewriterRef.current = null;
    }
    currentTarget.current = text;
    idxRef.current = 0;
    setDisplayedText('');
    setIsTyping(true);

    const scheduleNext = () => {
      typewriterRef.current = setTimeout(() => {
        idxRef.current++;
        setDisplayedText(text.slice(0, idxRef.current));
        if (idxRef.current >= text.length) {
          typewriterRef.current = null;
          setIsTyping(false);
          return;
        }
        scheduleNext();
      }, charDelayMs(textSpeedRef.current));
    };
    scheduleNext();
  }, []);

  const completeTypewriter = useCallback(() => {
    if (typewriterRef.current) {
      clearTimeout(typewriterRef.current);
      typewriterRef.current = null;
    }
    setDisplayedText(currentTarget.current);
    setIsTyping(false);
  }, []);

  useEffect(() => {
    return () => {
      if (typewriterRef.current) clearTimeout(typewriterRef.current);
    };
  }, []);

  return { displayedText, isTyping, startTypewriter, completeTypewriter };
}
