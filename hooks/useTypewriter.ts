import { useState, useCallback, useRef, useEffect } from 'react';

function charDelayMs(textSpeed: number): number {
  const clamped = Math.max(0, Math.min(1, textSpeed));
  return Math.round(60 - clamped * 48);
}

export function useTypewriter(textSpeed: number) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentTarget = useRef('');

  const startTypewriter = useCallback((text: string) => {
    if (typewriterRef.current) clearInterval(typewriterRef.current);
    currentTarget.current = text;
    setDisplayedText('');
    setIsTyping(true);
    let idx = 0;
    const delay = charDelayMs(textSpeed);

    typewriterRef.current = setInterval(() => {
      idx++;
      setDisplayedText(text.slice(0, idx));
      if (idx >= text.length) {
        clearInterval(typewriterRef.current!);
        typewriterRef.current = null;
        setIsTyping(false);
      }
    }, delay);
  }, [textSpeed]);

  const completeTypewriter = useCallback(() => {
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
    setDisplayedText(currentTarget.current);
    setIsTyping(false);
  }, []);

  useEffect(() => {
    return () => {
      if (typewriterRef.current) clearInterval(typewriterRef.current);
    };
  }, []);

  return { displayedText, isTyping, startTypewriter, completeTypewriter };
}
