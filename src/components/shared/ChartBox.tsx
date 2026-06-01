import React, { useRef, useState, useEffect } from 'react';

/**
 * Контейнер для recharts — измеряет ширину родителя и передаёт
 * точные пиксельные размеры дочернему графику.
 */
const ChartBox: React.FC<{
  height: number;
  children: (size: { width: number; height: number }) => React.ReactNode;
}> = ({ height, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const w = el.offsetWidth;
      if (w > 0) {
        setSize(prev => (prev.width === w && prev.height === height ? prev : { width: w, height }));
      }
    };

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    measure();
    requestAnimationFrame(measure);
    setTimeout(measure, 50);
    setTimeout(measure, 200);

    return () => {
      ro.disconnect();
    };
  }, [height]);

  return (
    <div ref={ref} style={{ width: '100%', height }}>
      {size.width > 0 ? children(size) : null}
    </div>
  );
};

export default ChartBox;
