
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { DocumentEditor } from './components/DocumentEditor';
import { MediaExplorer } from './components/MediaExplorer';
import { AppFile, MainSection } from './types';
import { NotificationBanner } from './components/NotificationBanner';

import { useNotifications } from './hooks/useNotifications';
import { useResizablePanel } from './hooks/useResizablePanel';
import { useDocumentHistory } from './hooks/useDocumentHistory';
import { useFileSystem } from './hooks/useFileSystem';
import { useChatLogic } from './hooks/useChatLogic';

const App: React.FC = () => {
  const { 
    activeNotification, 
    showNotification, 
    dismissNotification 
  } = useNotifications();

  const { 
    documentHistories,
    initializeHistory, 
    addHistoryStep, 
    undo: historyUndo, 
    redo: historyRedo, 
    getHistoryState, 
    deleteFileHistory,
    resetFileHistory
  } = useDocumentHistory();

  const {
    folders,
    files,
    activeFileId,
    setActiveFileId, // This is now selectFile from useFileSystem
    createFolder,
    createFile,
    selectFile,
    updateFileContentOnly,
    deleteItems,
    restoreItems,
    permanentDeleteItems,
    moveItems,
    renameFile,
    renameFolder,
    duplicateFile,
    getFolderNameById,
  } = useFileSystem({ showNotification, initializeHistory, deleteFileHistory, resetFileHistory });
  
  const activeFile = files.find(f => f.id === activeFileId && !f.deletedAt);

  const mainContentRef = useRef<HTMLDivElement>(null);
  const { 
    chatPanelWidth, 
    handleMouseDownOnDivider,
    setChatPanelWidth
  } = useResizablePanel(mainContentRef, activeFileId);


  const handleDocumentContentChange = useCallback((fileId: string, newContent: string) => {
    if (fileId) {
      updateFileContentOnly(fileId, newContent);
      addHistoryStep(fileId, newContent);
    }
  }, [updateFileContentOnly, addHistoryStep]);
  
  const {
    chatMessages,
    isAILoading,
    isAICollaborating,
    previousDocumentContentForUndo,
    sendNewMessage,
    editAndRegenerateMessage,
    deleteChatMessage,
    undoAIDocumentChange,
    addWelcomeMessage,
    setPreviousDocumentContentForUndo
  } = useChatLogic({ showNotification, updateDocumentContentWithHistory: handleDocumentContentChange });


  const [activeMainSection, setActiveMainSection] = useState<MainSection>('media');

  // Effect to handle actions when activeFileId changes (e.g., opening a file)
  useEffect(() => {
    if (activeFileId && activeFile) {
        // Reset AI undo state for the new file
        setPreviousDocumentContentForUndo(null);
        
        // Check if it was a newly created file vs. an existing one being opened
        // This distinction is tricky here without more state from createFile.
        // For simplicity, we'll assume addWelcomeMessage can handle it, or it defaults to "opened".
        // The original createFile had logic to determine if content was undefined for "new"
        const isNewFileCreation = !files.find(f => f.id === activeFileId)?.createdAt || 
                                  (Date.now() - new Date(files.find(f => f.id === activeFileId)?.createdAt || 0).getTime() < 1000); // Heuristic
        addWelcomeMessage(activeFile.name, isNewFileCreation);

        // Ensure chat panel is visible if a file is active
        if (chatPanelWidth === 0 && mainContentRef.current) {
            const containerWidth = mainContentRef.current.offsetWidth;
            let initialWidth = containerWidth / 3;
            if (initialWidth < 280) initialWidth = 280;
            if (containerWidth - initialWidth < 300) initialWidth = containerWidth - 300;
             if (initialWidth < 280 && containerWidth > 580) initialWidth = 280;
            setChatPanelWidth(initialWidth > 0 ? initialWidth : 280);
        }

    } else if (!activeFileId) {
        setPreviousDocumentContentForUndo(null); // Clear AI undo state if no file is active
        setChatPanelWidth(0); // Collapse chat panel if no file is active
    }
  }, [activeFileId, activeFile, addWelcomeMessage, setPreviousDocumentContentForUndo, chatPanelWidth, setChatPanelWidth]);

  const handleNavigateToSection = (section: MainSection) => {
    setActiveMainSection(section);
    selectFile(null); // Deselect any active file when changing main sections
  };

  const handleSelectFile = (fileId: string) => {
    selectFile(fileId); // selectFile from useFileSystem now handles initializing history
  };

  const handleUndoFromEditor = () => {
    if (activeFileId) {
      const newContent = historyUndo(activeFileId);
      if (newContent !== undefined) {
        updateFileContentOnly(activeFileId, newContent); // Update content without adding new history step
      }
    }
  };

  const handleRedoFromEditor = () => {
    if (activeFileId) {
      const newContent = historyRedo(activeFileId);
      if (newContent !== undefined) {
        updateFileContentOnly(activeFileId, newContent); // Update content without adding new history step
      }
    }
  };
  
  const currentFileHistoryState = getHistoryState(activeFileId);

  const renderMainContent = () => {
    if (!activeFileId || !activeFile) {
      return (
        <div className="flex-1" ref={mainContentRef}>
          <MediaExplorer
            allFolders={folders}
            allFiles={files}
            onSelectFile={handleSelectFile}
            onCreateFolder={createFolder}
            onCreateFile={(fileName, folderId, content) => {
                const newFile = createFile(fileName, folderId, content);
                // If it's a user-initiated new empty file, createFile already sets it active.
                // If it's an upload, it doesn't auto-select.
                if (content === undefined) { // New empty file
                    // Welcome message logic is now in useEffect watching activeFileId
                }
            }}
            activeFileId={activeFileId}
            getFolderNameById={getFolderNameById}
            onMoveItems={moveItems}
            onDeleteItems={deleteItems}
            onRestoreItems={restoreItems}
            onPermanentDeleteItems={permanentDeleteItems}
            onRenameFile={renameFile}
            onRenameFolder={renameFolder}
            onDuplicateFile={duplicateFile}
            showNotification={showNotification}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-1 overflow-hidden" ref={mainContentRef}>
        <DocumentEditor
          fileName={activeFile.name}
          content={activeFile.content}
          onContentChange={(newContent) => handleDocumentContentChange(activeFile.id, newContent)}
          isCollaborating={isAICollaborating}
          activeFile={activeFile}
          previousDocumentContentForUndo={previousDocumentContentForUndo}
          onUndoAIChange={() => undoAIDocumentChange(activeFile)}
          onUndo={handleUndoFromEditor}
          onRedo={handleRedoFromEditor}
          canUndo={currentFileHistoryState.canUndo}
          canRedo={currentFileHistoryState.canRedo}
          onGoBack={() => handleNavigateToSection('media')}
        />
        {chatPanelWidth > 0 && (
          <>
            <div
              className="w-2 bg-slate-200 hover:bg-slate-300 cursor-col-resize flex-shrink-0 transition-colors duration-150"
              onMouseDown={handleMouseDownOnDivider}
              title="Arrastra para redimensionar"
              aria-label="Redimensionar panel de chat"
            />
            <ChatPanel
              style={{ width: `${chatPanelWidth}px`, flexShrink: 0 }}
              messages={chatMessages}
              onSendNewMessage={(text, imgPart, imgPreviewUrl) => sendNewMessage(text, activeFile, imgPart, imgPreviewUrl)}
              onEditAndRegenerateMessage={(msgId, newText, imgPart, imgPreviewUrl) => editAndRegenerateMessage(msgId, newText, activeFile, imgPart, imgPreviewUrl)}
              onDeleteMessage={deleteChatMessage}
              isLoading={isAILoading}
              activeDocumentName={activeFile.name}
              showNotification={showNotification}
            />
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <NotificationBanner notification={activeNotification} onDismiss={dismissNotification} />
      <Sidebar
        activeMainSection={activeMainSection}
        onNavigateTo={handleNavigateToSection}
      />
      <main className="flex-grow flex h-full overflow-hidden">
        {renderMainContent()}
      </main>
    </div>
  );
};

export default App;
