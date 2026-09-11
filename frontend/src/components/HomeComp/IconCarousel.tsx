import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
const apiURL = import.meta.env.VITE_SERVER_BASE_URL;

const defaultIcons = ["🔥", "🚀", "🎯", "💡"];

export default function IconCarousel({
  items = defaultIcons,
  speed = 60,         
  gap = 16,           
} : {
    items: Array<string>,
    speed: number,
    gap: number
}) {

  
  const containerRef = useRef<HTMLDivElement | null>(null);
  const passRef = useRef<HTMLDivElement | null>(null);  
  const [metrics, setMetrics] = useState({ passWidth: 0, containerWidth: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      if (!containerRef.current || !passRef.current) return;
      setMetrics({
        passWidth: passRef.current.scrollWidth,
        containerWidth: containerRef.current.clientWidth,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    const container = containerRef.current;
    if(container === null)
      return;
    ro.observe(container);
    return () => ro.disconnect();
  }, [items]);

  const { repeats, cycle, duration } = useMemo(() => {
    const passWidth = metrics.passWidth || 1;
    const containerWidth = metrics.containerWidth || 1;

    const minTotal = containerWidth * 2;
    const baseRepeats = Math.ceil(minTotal / passWidth);
    const repeats = Math.max(2, baseRepeats);

    const cycle = passWidth;               
    const duration = cycle / Math.max(1, speed); 

    return { repeats, cycle, duration };
  }, [metrics, speed]);


  const repeated = useMemo(() => {
    const arr = [];
    for (let r = 0; r < repeats; r++) {
      arr.push(...items);
    }
    return arr;
  }, [items, repeats]);

  if (!items?.length) return null;


  type CSSProperties = React.CSSProperties & {
    [key: `--${string}`]: string | number;
  };
  const style: CSSProperties = {
    "--gap": `${gap}px`,
    "--cycle": `${cycle}px`,
    "--duration": `${duration}s`
  }

  return (
    <div
      className="IconCarousel"
      ref={containerRef}
      style={style}
    >
      {/* Hidden single pass for measuring width */}
      <div
        ref={passRef}
        style={{
          position: "absolute",
          visibility: "hidden",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      >
        <div style={{ display: "inline-flex", gap }}>
          {items.map((icon, i) => (
            <div className="icon" key={`measure-${i}`}>{icon}</div>
          ))}
        </div>
      </div>

      {/* Animated track */}
      <div className="carousel-track">
        {
          items == defaultIcons ?
        repeated.map((icon, i) => (
          <div className="icon" key={i}>{icon}</div>
        )) :
        repeated.map((icon, i) => (
          <div className="icon" key={i}><img className = "auction_icon" src = {`${apiURL}/GoldSVGs/${icon}.svg`} height = {32} width = {32}/></div>
        ))
        }
      </div>
    </div>
  );
}