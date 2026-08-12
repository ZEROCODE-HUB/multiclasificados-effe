import { useEffect, useMemo, useRef, useState } from "react";

interface CountUpProps {
  value: string;
  duration?: number;
}

// Parses a string like "8,200+", "150K+", "24/7", "98%" and animates the numeric part.
export function CountUp({ value, duration = 1600 }: CountUpProps) {
  // useMemo, no una constante suelta: el efecto la usa, y sin memoizar sería
  // un objeto nuevo en cada render (la dependencia obligaría a re-animar).
  const match = useMemo(() => value.match(/^([^\d]*)([\d,.]+)([^\d]*)$/), [value]);
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(match ? `${match[1]}0${match[3]}` : value);

  useEffect(() => {
    if (!match) {
      setDisplay(value);
      return;
    }
    const prefix = match[1];
    const numStr = match[2];
    const suffix = match[3];
    const target = parseFloat(numStr.replace(/,/g, ""));
    const hasComma = numStr.includes(",");

    let started = false;
    const el = ref.current;
    if (!el) return;

    const animate = () => {
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        const current = target * eased;
        const formatted = hasComma
          ? Math.round(current).toLocaleString()
          : current >= 10
            ? Math.round(current).toString()
            : current.toFixed(0);
        setDisplay(`${prefix}${formatted}${suffix}`);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !started) {
            started = true;
            animate();
            observer.disconnect();
          }
        });
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [match, value, duration]);

  return <span ref={ref}>{display}</span>;
}
