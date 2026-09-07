import { useEffect, useRef, useState } from "react";

export function useCopyFeedback(identity: string) {
  const [copied, setCopied] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const version = ++generation.current;
    busy.current = false;
    setCopied(false);
    return () => {
      generation.current = version + 1;
      clearTimeout(timer.current);
    };
  }, [identity]);
  const copy = async (action: () => Promise<void> | void) => {
    if (busy.current) return;
    busy.current = true;
    const token = generation.current;
    try {
      await action();
      if (token !== generation.current) return;
      setCopied(true);
      timer.current = setTimeout(() => {
        busy.current = false;
        setCopied(false);
      }, 1500);
    } catch {
      if (token !== generation.current) return;
      busy.current = false;
      setCopied(false);
    }
  };
  return { copied, copy };
}
