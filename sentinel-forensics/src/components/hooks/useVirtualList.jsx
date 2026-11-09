import { useState, useEffect, useRef, useMemo } from 'react';

/**
 * VIRTUAL LIST HOOK
 * High-performance virtualization for large lists
 */
export function useVirtualList(items, options = {}) {
  const {
    itemHeight = 60,
    overscan = 3,
    containerHeight = 600,
    scrollThreshold = 100
  } = options;

  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef(null);

  // Calculate visible range
  const { visibleRange, totalHeight, offsetY } = useMemo(() => {
    const totalHeight = items.length * itemHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    return {
      visibleRange: [startIndex, endIndex],
      totalHeight,
      offsetY: startIndex * itemHeight
    };
  }, [items.length, itemHeight, scrollTop, containerHeight, overscan]);

  // Get visible items
  const visibleItems = useMemo(() => {
    const [start, end] = visibleRange;
    return items.slice(start, end + 1).map((item, idx) => ({
      item,
      index: start + idx,
      offsetY: (start + idx) * itemHeight
    }));
  }, [items, visibleRange, itemHeight]);

  // Handle scroll with throttle
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
      setIsScrolling(true);

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Set scrolling to false after delay
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Scroll to index
  const scrollToIndex = (index, behavior = 'smooth') => {
    const container = containerRef.current;
    if (!container) return;

    const targetScroll = index * itemHeight;
    container.scrollTo({
      top: targetScroll,
      behavior
    });
  };

  // Scroll to top
  const scrollToTop = (behavior = 'smooth') => {
    scrollToIndex(0, behavior);
  };

  // Scroll to bottom
  const scrollToBottom = (behavior = 'smooth') => {
    scrollToIndex(items.length - 1, behavior);
  };

  return {
    containerRef,
    visibleItems,
    totalHeight,
    offsetY,
    isScrolling,
    scrollToIndex,
    scrollToTop,
    scrollToBottom,
    visibleRange
  };
}

/**
 * VIRTUAL GRID HOOK
 * 2D virtualization for grids
 */
export function useVirtualGrid(items, options = {}) {
  const {
    columnCount = 3,
    itemWidth = 200,
    itemHeight = 200,
    gap = 16,
    containerHeight = 600,
    overscan = 1
  } = options;

  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);

  const rowCount = Math.ceil(items.length / columnCount);
  const totalHeight = rowCount * (itemHeight + gap) - gap;

  // Calculate visible rows
  const { visibleRange, offsetY } = useMemo(() => {
    const startRow = Math.max(0, Math.floor(scrollTop / (itemHeight + gap)) - overscan);
    const endRow = Math.min(
      rowCount - 1,
      Math.ceil((scrollTop + containerHeight) / (itemHeight + gap)) + overscan
    );

    return {
      visibleRange: [startRow, endRow],
      offsetY: startRow * (itemHeight + gap)
    };
  }, [scrollTop, itemHeight, gap, rowCount, containerHeight, overscan]);

  // Get visible items
  const visibleItems = useMemo(() => {
    const [startRow, endRow] = visibleRange;
    const visible = [];

    for (let row = startRow; row <= endRow; row++) {
      for (let col = 0; col < columnCount; col++) {
        const index = row * columnCount + col;
        if (index < items.length) {
          visible.push({
            item: items[index],
            index,
            row,
            col,
            offsetX: col * (itemWidth + gap),
            offsetY: row * (itemHeight + gap)
          });
        }
      }
    }

    return visible;
  }, [items, visibleRange, columnCount, itemWidth, itemHeight, gap]);

  // Handle scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  return {
    containerRef,
    visibleItems,
    totalHeight,
    offsetY,
    columnCount,
    rowCount
  };
}