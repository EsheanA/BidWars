import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
const apiURL = import.meta.env.VITE_SERVER_BASE_URL;
// import "./IconCarousel.css";

const defaultIcons = ["🔥", "🚀", "🎯", "💡"];

export default function IconCarousel({
  // icons,
  items = defaultIcons,
  // items = icons,
  speed = 60,         
  gap = 16,           
}) {
  const containerRef = useRef(null);
  const passRef = useRef(null);   // width of ONE “pass” (one full items array)
  const [metrics, setMetrics] = useState({ passWidth: 0, containerWidth: 0 });

  // Measure once items render
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
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [items]);

  const { repeats, cycle, duration } = useMemo(() => {
    const passWidth = metrics.passWidth || 1;
    const containerWidth = metrics.containerWidth || 1;

    // Ensure enough content so there’s never a gap: total width >= 2 * viewport
    const minTotal = containerWidth * 2;
    const baseRepeats = Math.ceil(minTotal / passWidth);
    const repeats = Math.max(2, baseRepeats);

    const cycle = passWidth;                // move exactly one “pass” per loop
    const duration = cycle / Math.max(1, speed); // seconds (px / pxPerSec)

    return { repeats, cycle, duration };
  }, [metrics, speed]);

  // Build the repeated content (N passes)
  const repeated = useMemo(() => {
    const arr = [];
    for (let r = 0; r < repeats; r++) {
      arr.push(...items);
    }
    return arr;
  }, [items, repeats]);

  if (!items?.length) return null;

  return (
    <div
      className="IconCarousel"
      ref={containerRef}
      style={{
        "--gap": `${gap}px`,
        "--cycle": `${cycle}px`,
        "--duration": `${duration}s`,
      }}
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
          // <div className="icon" key={i}><img className = "auction_icon" src = {`${apiURL}/BidWarsSVGs/${icon}.svg`} height = {32} width = {32}/></div>
          <div className="icon" key={i}><img className = "auction_icon" src = {`${apiURL}/GoldSVGs/${icon}.svg`} height = {32} width = {32}/></div>

        ))
        }
      </div>
    </div>
  );
}