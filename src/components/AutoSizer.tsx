import React, { useRef, useState, useLayoutEffect, type CSSProperties, type ReactNode } from 'react';

interface AutoSizerProps {
    children: (size: { width: number; height: number }) => ReactNode;
    className?: string;
    style?: CSSProperties;
}

export const AutoSizer = ({ children, className = '', style = {} }: AutoSizerProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useLayoutEffect(() => {
        if (!containerRef.current) return;

        // Initial measure
        const measure = () => {
            if (containerRef.current) {
                setSize({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight
                });
            }
        };
        measure();

        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                // Use contentRect for precise content box size
                setSize({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={containerRef}
            className={className}
            style={{ flex: 1, overflow: 'hidden', ...style }}
        >
            {/* Only render children if we have a valid size, preventing 0-height glitches */}
            {size.height > 0 && children(size)}
        </div>
    );
};
