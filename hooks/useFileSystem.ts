
import { useState, useEffect, useCallback } from 'react';
import { Folder, AppFile } from '../types';
import { generateId, dateReviver } from '../utils/helpers';

const LS_FOLDERS_KEY = 'aiLedgerApp_folders_v3';
const LS_FILES_KEY = 'aiLedgerApp_files_v3';

interface FileSystemProps {
  showNotification: (type: 'success' | 'error' | 'info', message: string, title?: string) => void;
  initializeHistory: (fileId: string, initialContent: string) => void;
  deleteFileHistory: (fileId: string) => void;
  resetFileHistory: (fileId: string, content: string) => void;
}

export const useFileSystem = ({ 
  showNotification, 
  initializeHistory, 
  deleteFileHistory,
  resetFileHistory 
}: FileSystemProps) => {
  const [folders, setFolders] = useState<Folder[]>(() => {
    const savedFolders = localStorage.getItem(LS_FOLDERS_KEY);
    return savedFolders ? JSON.parse(savedFolders, dateReviver) : [];
  });
  const [files, setFiles] = useState<AppFile[]>(() => {
    const savedFiles = localStorage.getItem(LS_FILES_KEY);
    return savedFiles ? JSON.parse(savedFiles, dateReviver) : [];
  });
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(LS_FOLDERS_KEY, JSON.stringify(folders));
  }, [folders]);

  useEffect(() => {
    localStorage.setItem(LS_FILES_KEY, JSON.stringify(files));
  }, [files]);

  const createFolder = useCallback((folderName: string, parentId: string | null) => {
    const newFolder: Folder = { id: generateId(), name: folderName, parentId, deletedAt: null };
    setFolders(prev => [...prev, newFolder]);
    showNotification('success', `Carpeta "${newFolder.name}" creada.`);
  }, [showNotification]);

  const createFile = useCallback((fileName: string, folderId: string | null, content?: string): AppFile => {
    const initialContent = content === undefined ? "" : content; // Default to empty string if content is for new file
    const newFile: AppFile = { 
        id: generateId(), 
        name: fileName, 
        folderId, 
        content: initialContent, 
        createdAt: new Date(), 
        deletedAt: null 
    };
    setFiles(prev => [...prev, newFile]);
    initializeHistory(newFile.id, initialContent);
    
    if (content === undefined) { // A new, empty file was created by user action
      setActiveFileId(newFile.id); 
      // Welcome message for new file will be handled by chat logic based on activeFileId change
    } else { // File was uploaded/processed
      showNotification('success', `Archivo "${newFile.name}" ${fileName.includes("Copia de") ? 'duplicado' : 'subido y procesado'}.`);
    }
    return newFile;
  }, [showNotification, initializeHistory]);

  const selectFile = useCallback((fileId: string | null) => {
    if (fileId === null) {
        setActiveFileId(null);
        return;
    }
    const selectedFile = files.find(f => f.id === fileId && !f.deletedAt);
    if (selectedFile) {
      setActiveFileId(fileId);
      // Ensure history is initialized or reset if needed.
      // resetFileHistory might be more appropriate here if we want to ensure history starts fresh
      // from the stored content upon selection, discarding any unsaved in-memory history for that file.
      // For simplicity with current history model, initializeHistory checks existing state.
      initializeHistory(fileId, selectedFile.content); 
      // Welcome message handled by App.tsx effect watching activeFileId
    } else {
      setActiveFileId(null); // File not found or deleted
    }
  }, [files, initializeHistory, resetFileHistory]);


  const updateFileContentOnly = useCallback((fileId: string, newContent: string) => {
    setFiles(prevFiles => prevFiles.map(f => (f.id === fileId ? { ...f, content: newContent } : f)));
    // History step is added separately by the caller (handleDocumentContentChange in App.tsx)
  }, []);


  const getAllDescendantAndSelfIds = useCallback((itemId: string, itemType: 'file' | 'folder', currentFolders: Folder[], currentFiles: AppFile[]): { files: string[], folders: string[] } => {
    let fileIds: string[] = [];
    let folderIds: string[] = [];

    if (itemType === 'file') {
        fileIds.push(itemId);
    } else { // folder
        folderIds.push(itemId);
        const q: string[] = [itemId];
        while (q.length > 0) {
            const currentFolderId = q.shift()!;
            const childFolders = currentFolders.filter(f => f.parentId === currentFolderId);
            const childFiles = currentFiles.filter(f => f.folderId === currentFolderId);
            childFolders.forEach(f => { folderIds.push(f.id); q.push(f.id); });
            childFiles.forEach(f => fileIds.push(f.id));
        }
    }
    return { files: Array.from(new Set(fileIds)), folders: Array.from(new Set(folderIds)) };
  }, []);


  const deleteItems = useCallback((itemIds: string[], itemTypes: ('file' | 'folder')[]) => {
    const now = new Date();
    let allFilesToMarkDeleted: string[] = [];
    let allFoldersToMarkDeleted: string[] = [];

    itemIds.forEach((id, index) => {
        const { files: descFiles, folders: descFolders } = getAllDescendantAndSelfIds(id, itemTypes[index], folders, files);
        allFilesToMarkDeleted.push(...descFiles);
        allFoldersToMarkDeleted.push(...descFolders);
    });
    
    allFilesToMarkDeleted = Array.from(new Set(allFilesToMarkDeleted));
    allFoldersToMarkDeleted = Array.from(new Set(allFoldersToMarkDeleted));

    setFiles(prevFiles => prevFiles.map(f => allFilesToMarkDeleted.includes(f.id) ? { ...f, deletedAt: now } : f));
    setFolders(prevFolders => prevFolders.map(f => allFoldersToMarkDeleted.includes(f.id) ? { ...f, deletedAt: now } : f));

    if (activeFileId && allFilesToMarkDeleted.includes(activeFileId)) {
        setActiveFileId(null);
    }
    const count = allFilesToMarkDeleted.length + allFoldersToMarkDeleted.length;
    showNotification('success', `${count} elemento(s) movido(s) a la papelera.`);
  }, [files, folders, activeFileId, getAllDescendantAndSelfIds, showNotification]);
  
  const restoreItems = useCallback((itemIds: string[], itemTypes: ('file' | 'folder')[]) => {
    let allFilesToRestore: string[] = [];
    let allFoldersToRestore: string[] = [];

    itemIds.forEach((id, index) => {
        const { files: descFiles, folders: descFolders } = getAllDescendantAndSelfIds(id, itemTypes[index], folders, files);
        allFilesToRestore.push(...descFiles);
        allFoldersToRestore.push(...descFolders);
    });

    allFilesToRestore = Array.from(new Set(allFilesToRestore));
    allFoldersToRestore = Array.from(new Set(allFoldersToRestore));

    setFiles(prevFiles => prevFiles.map(f => allFilesToRestore.includes(f.id) ? { ...f, deletedAt: null } : f));
    setFolders(prevFolders => prevFolders.map(f => allFoldersToRestore.includes(f.id) ? { ...f, deletedAt: null } : f));
    
    const count = allFilesToRestore.length + allFoldersToRestore.length;
    showNotification('success', `${count} elemento(s) restaurado(s) de la papelera.`);
  }, [files, folders, getAllDescendantAndSelfIds, showNotification]);

  const permanentDeleteItems = useCallback((itemIds: string[], itemTypes: ('file' | 'folder')[]) => {
    let allFilesToDeletePerm: string[] = [];
    let allFoldersToDeletePerm: string[] = [];

    itemIds.forEach((id, index) => {
        const { files: descFiles, folders: descFolders } = getAllDescendantAndSelfIds(id, itemTypes[index], folders, files);
        allFilesToDeletePerm.push(...descFiles);
        allFoldersToDeletePerm.push(...descFolders);
    });

    allFilesToDeletePerm = Array.from(new Set(allFilesToDeletePerm));
    allFoldersToDeletePerm = Array.from(new Set(allFoldersToDeletePerm));

    setFiles(prevFiles => prevFiles.filter(f => !allFilesToDeletePerm.includes(f.id)));
    setFolders(prevFolders => prevFolders.filter(f => !allFoldersToDeletePerm.includes(f.id)));
    
    allFilesToDeletePerm.forEach(id => deleteFileHistory(id));

    if (activeFileId && allFilesToDeletePerm.includes(activeFileId)) {
        setActiveFileId(null);
    }
    const count = allFilesToDeletePerm.length + allFoldersToDeletePerm.length;
    showNotification('success', `${count} elemento(s) eliminado(s) permanentemente.`);
  }, [files, folders, activeFileId, getAllDescendantAndSelfIds, showNotification, deleteFileHistory]);
  
  const moveItems = useCallback((itemIdsToMove: string[], itemTypes: ('file' | 'folder')[], targetParentId: string | null) => {
    setFiles(prevFiles => 
        prevFiles.map(f => itemIdsToMove.includes(f.id) && itemTypes[itemIdsToMove.indexOf(f.id)] === 'file' ? { ...f, folderId: targetParentId } : f)
    );
    setFolders(prevFolders => 
        prevFolders.map(f => itemIdsToMove.includes(f.id) && itemTypes[itemIdsToMove.indexOf(f.id)] === 'folder' ? { ...f, parentId: targetParentId } : f)
    );
    const targetFolderName = targetParentId ? (folders.find(f => f.id === targetParentId)?.name || 'carpeta desconocida') : 'Medios (Raíz)';
    showNotification('success', `${itemIdsToMove.length} elemento(s) movido(s) a "${targetFolderName}".`);
  }, [folders, showNotification]);


  const renameFile = (fileId: string, newName: string) => {
    const oldFile = files.find(f => f.id === fileId);
    if (!oldFile) return;
    setFiles(pf => pf.map(f => f.id === fileId ? { ...f, name: newName } : f));
    showNotification('success', `Archivo renombrado de "${oldFile.name}" a "${newName}".`);
  };

  const renameFolder = (folderId: string, newName: string) => {
    const oldFolder = folders.find(f => f.id === folderId);
    if(!oldFolder) return;
    setFolders(pf => pf.map(f => f.id === folderId ? { ...f, name: newName } : f));
    showNotification('success', `Carpeta renombrada de "${oldFolder.name}" a "${newName}".`);
  };

  const duplicateFile = (fileId: string) => {
    const originalFile = files.find(f => f.id === fileId);
    if (!originalFile) return;
    const newFileName = `Copia de ${originalFile.name}`;
    // Use the createFile function to handle new file creation and history initialization
    createFile(newFileName, originalFile.folderId, originalFile.content);
    // showNotification is handled by createFile for uploaded/processed files
  };

  return {
    folders,
    files,
    activeFileId,
    setActiveFileId: selectFile, // Renamed for clarity, selectFile handles logic
    createFolder,
    createFile,
    selectFile, // Keep selectFile for direct use if needed
    updateFileContentOnly,
    deleteItems,
    restoreItems,
    permanentDeleteItems,
    moveItems,
    renameFile,
    renameFolder,
    duplicateFile,
    getFolderNameById: (id: string | null) => id ? folders.find(f => f.id === id)?.name || 'Desconocido' : 'Medios (Raíz)',
  };
};
