
import { useState, useEffect, useCallback, useRef, RefObject } from 'react';

const MIN_CHAT_PANEL_WIDTH = 280; // px
const MIN_DOC_EDITOR_WIDTH = 300; // px

export const useResizablePanel = (mainContentRef: RefObject<HTMLDivElement>, initialActiveFileId: string | null) => {
  const [chatPanelWidth, setChatPanelWidth] = useState(0);
  const isResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startChatPanelWidthRef = useRef(0);

  useEffect(() => {
    if (mainContentRef.current && initialActiveFileId) { // Only set initial width if a file is active (panel is visible)
      const containerWidth = mainContentRef.current.offsetWidth;
      let initialWidth = containerWidth / 3;
      if (initialWidth < MIN_CHAT_PANEL_WIDTH) initialWidth = MIN_CHAT_PANEL_WIDTH;
      if (containerWidth - initialWidth < MIN_DOC_EDITOR_WIDTH) initialWidth = containerWidth - MIN_DOC_EDITOR_WIDTH;
      if (initialWidth < MIN_CHAT_PANEL_WIDTH && containerWidth > MIN_DOC_EDITOR_WIDTH + MIN_CHAT_PANEL_WIDTH) initialWidth = MIN_CHAT_PANEL_WIDTH;
      
      setChatPanelWidth(initialWidth > 0 ? initialWidth : MIN_CHAT_PANEL_WIDTH);

    } else if (!initialActiveFileId) {
        setChatPanelWidth(0); // Collapse or hide panel if no file is active
    }
  }, [mainContentRef, initialActiveFileId]);


  const handleMouseDownOnDivider = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    startXRef.current = e.clientX;
    startChatPanelWidthRef.current = chatPanelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRef.current || !mainContentRef.current) return;
      
      const deltaX = event.clientX - startXRef.current;
      let newWidth = startChatPanelWidthRef.current - deltaX; // Inverted logic for right panel
      
      const containerWidth = mainContentRef.current.offsetWidth;

      if (newWidth < MIN_CHAT_PANEL_WIDTH) newWidth = MIN_CHAT_PANEL_WIDTH;
      if (containerWidth - newWidth < MIN_DOC_EDITOR_WIDTH) {
        newWidth = containerWidth - MIN_DOC_EDITOR_WIDTH;
      }
      // Final check to ensure newWidth is not less than minChatWidth if there's enough space
      if (newWidth < MIN_CHAT_PANEL_WIDTH && (containerWidth - MIN_DOC_EDITOR_WIDTH) >= MIN_CHAT_PANEL_WIDTH) {
         newWidth = MIN_CHAT_PANEL_WIDTH;
      }


      setChatPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [chatPanelWidth, mainContentRef]);

  return {
    chatPanelWidth,
    handleMouseDownOnDivider,
    setChatPanelWidth // Expose setter if external control is needed (e.g. to collapse)
  };
};
