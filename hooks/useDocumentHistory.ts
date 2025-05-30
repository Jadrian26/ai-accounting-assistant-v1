
import { useState, useEffect, useCallback } from 'react';

const LS_DOCUMENT_HISTORIES_KEY = 'aiLedgerApp_documentHistories_v1'; // v1 to avoid conflict with App.tsx's old key immediately
const MAX_HISTORY_STEPS = 50;

export interface DocumentHistoryEntry {
  history: string[];
  currentIndex: number;
}

export const useDocumentHistory = () => {
  const [documentHistories, setDocumentHistories] = useState<Record<string, DocumentHistoryEntry>>(() => {
    const savedHistories = localStorage.getItem(LS_DOCUMENT_HISTORIES_KEY);
    return savedHistories ? JSON.parse(savedHistories) : {};
  });

  useEffect(() => {
    localStorage.setItem(LS_DOCUMENT_HISTORIES_KEY, JSON.stringify(documentHistories));
  }, [documentHistories]);

  const initializeHistory = useCallback((fileId: string, initialContent: string) => {
    setDocumentHistories(prev => {
      // Only initialize if it doesn't exist, or if existing history's last state doesn't match initialContent
      // This helps preserve history if a file is re-opened and its content hasn't changed since last edit.
      if (!prev[fileId] || prev[fileId].history[prev[fileId].history.length -1] !== initialContent) {
        return {
          ...prev,
          [fileId]: { history: [initialContent], currentIndex: 0 }
        };
      }
      return prev;
    });
  }, []);
  
  const addHistoryStep = useCallback((fileId: string, newContent: string) => {
    setDocumentHistories(prevHistories => {
      const currentFileHistory = prevHistories[fileId] || { history: [""], currentIndex: -1 }; // Ensure history exists
      
      // If current content is already the same as newContent, don't add a new step
      if (currentFileHistory.currentIndex >= 0 && currentFileHistory.history[currentFileHistory.currentIndex] === newContent) {
          return prevHistories;
      }

      let newHistoryArray = [
        ...currentFileHistory.history.slice(0, currentFileHistory.currentIndex + 1),
        newContent
      ];

      if (newHistoryArray.length > MAX_HISTORY_STEPS) {
        newHistoryArray = newHistoryArray.slice(-MAX_HISTORY_STEPS);
      }
      
      return {
        ...prevHistories,
        [fileId]: { history: newHistoryArray, currentIndex: newHistoryArray.length - 1 }
      };
    });
  }, []);

  const undo = useCallback((fileId: string): string | undefined => {
    let newContent: string | undefined = undefined;
    setDocumentHistories(prev => {
      const historyEntry = prev[fileId];
      if (historyEntry && historyEntry.currentIndex > 0) {
        const newIndex = historyEntry.currentIndex - 1;
        newContent = historyEntry.history[newIndex];
        return { ...prev, [fileId]: { ...historyEntry, currentIndex: newIndex } };
      }
      return prev;
    });
    return newContent;
  }, []);

  const redo = useCallback((fileId: string): string | undefined => {
    let newContent: string | undefined = undefined;
    setDocumentHistories(prev => {
      const historyEntry = prev[fileId];
      if (historyEntry && historyEntry.currentIndex < historyEntry.history.length - 1) {
        const newIndex = historyEntry.currentIndex + 1;
        newContent = historyEntry.history[newIndex];
        return { ...prev, [fileId]: { ...historyEntry, currentIndex: newIndex } };
      }
      return prev;
    });
    return newContent;
  }, []);

  const getHistoryState = useCallback((fileId: string | null) => {
    if (!fileId || !documentHistories[fileId]) {
      return { canUndo: false, canRedo: false };
    }
    const { history, currentIndex } = documentHistories[fileId];
    return {
      canUndo: currentIndex > 0,
      canRedo: currentIndex < history.length - 1,
    };
  }, [documentHistories]);

  const deleteFileHistory = useCallback((fileId: string) => {
    setDocumentHistories(prev => {
      const newHistories = { ...prev };
      delete newHistories[fileId];
      return newHistories;
    });
  }, []);
  
  const resetFileHistory = useCallback((fileId: string, content: string) => {
    setDocumentHistories(prev => ({
        ...prev,
        [fileId]: { history: [content], currentIndex: 0 }
    }));
  }, []);


  return {
    documentHistories, // Mainly for direct inspection or complex scenarios, prefer specific functions
    initializeHistory,
    addHistoryStep,
    undo,
    redo,
    getHistoryState,
    deleteFileHistory,
    resetFileHistory,
  };
};
