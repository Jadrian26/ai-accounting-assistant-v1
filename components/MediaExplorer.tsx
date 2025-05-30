
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Folder, AppFile, NotificationType } from '../types';
import { FolderIcon, FileIcon, ExcelFileIcon, DocxFileIcon, PlusIcon, UploadIcon, ChevronRightIcon, HomeIcon, EllipsisVerticalIcon, TrashIcon, ArrowPathIcon, PencilIcon, DocumentDuplicateIcon, RefreshIcon, ArchiveBoxArrowDownIcon } from './icons';
import { Button } from './Button';
import { Modal } from './Modal';
import { parseExcelToCsvString } from '../utils/tabularDataParser'; 
import { parseDocxToText } from '../utils/docxParser';

interface MediaExplorerProps {
  allFolders: Folder[];
  allFiles: AppFile[];
  activeFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onCreateFolder: (folderName: string, parentId: string | null) => void;
  onCreateFile: (fileName: string, folderId: string | null, content?: string) => void;
  getFolderNameById: (id: string) => string;
  
  onMoveItems: (itemIds: string[], itemTypes: ('file' | 'folder')[], targetParentId: string | null) => void;
  onDeleteItems: (itemIds: string[], itemTypes: ('file' | 'folder')[]) => void; // Moves to trash
  onRestoreItems: (itemIds: string[], itemTypes: ('file' | 'folder')[]) => void;
  onPermanentDeleteItems: (itemIds: string[], itemTypes: ('file' | 'folder')[]) => void;

  onRenameFile: (fileId: string, newName: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDuplicateFile: (fileId: string) => void;
  showNotification: (type: NotificationType, message: string, title?: string) => void;
}

type ModalType = null | 'createFolder' | 'moveItem' | 'renameItem' | 'confirmAction'; 
interface ItemToModify { id: string; name: string; type: 'file' | 'folder'; originalParentId?: string | null; }
interface ConfirmActionDetails { title: string; message: string; confirmText: string; onConfirm: () => void; itemType?: 'file' | 'folder'; itemName?: string; }

const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];
const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel' // .xls
];
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';


export const MediaExplorer: React.FC<MediaExplorerProps> = ({
  allFolders,
  allFiles,
  activeFileId,
  onSelectFile,
  onCreateFolder,
  onCreateFile,
  getFolderNameById,
  onMoveItems,
  onDeleteItems, // Soft delete
  onRestoreItems,
  onPermanentDeleteItems,
  onRenameFile,
  onRenameFolder,
  onDuplicateFile,
  showNotification,
}) => {
  const [currentPathIds, setCurrentPathIds] = useState<string[]>([]);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [itemToModify, setItemToModify] = useState<ItemToModify | null>(null); // For single item rename/move
  const [targetFolderForMove, setTargetFolderForMove] = useState<string | null | undefined>(undefined); 
  const [renameInput, setRenameInput] = useState('');
  const [isDraggingOverZone, setIsDraggingOverZone] = useState(false); 
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  // const [draggingItemType, setDraggingItemType] = useState<'file' | 'folder' | null>(null); // No longer needed for this logic
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null | undefined>(undefined);
  const [osFileDragTargetId, setOsFileDragTargetId] = useState<string | null | undefined>(undefined);
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null); 
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const fileUploadInputRef = useRef<HTMLInputElement>(null);

  const [showTrashView, setShowTrashView] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Record<string, 'file' | 'folder'>>({});
  const [confirmActionDetails, setConfirmActionDetails] = useState<ConfirmActionDetails | null>(null);

  const currentFolderId = currentPathIds.length > 0 ? currentPathIds[currentPathIds.length - 1] : null;

  const displayedFolders = allFolders.filter(f => 
    f.parentId === currentFolderId && (showTrashView ? f.deletedAt !== null : f.deletedAt === null || f.deletedAt === undefined)
  );
  const displayedFiles = allFiles.filter(f => 
    f.folderId === currentFolderId && (showTrashView ? f.deletedAt !== null : f.deletedAt === null || f.deletedAt === undefined)
  );

  const handleNavigate = (pathIds: string[]) => {
    setCurrentPathIds(pathIds);
    setShowActionsMenu(null);
    setSelectedItems({}); 
  };

  const handleFolderClick = (folderId: string) => {
    if (showTrashView) return; // No navigation within trash view for folders
    setCurrentPathIds(prev => [...prev, folderId]);
    setShowActionsMenu(null);
    setSelectedItems({});
  };
  
  const handleCreateFolderSubmit = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim(), currentFolderId);
      setNewFolderName('');
      setActiveModal(null);
    }
  };
  
  const handleMoveSelectedItems = () => {
    if (Object.keys(selectedItems).length === 0) return;
    if (targetFolderForMove !== undefined) {
        const itemIds = Object.keys(selectedItems);
        const itemTypes = itemIds.map(id => selectedItems[id]);
        
        // Check if any selected folder is being moved into itself or one of its children
        for (let i = 0; i < itemIds.length; i++) {
            if (itemTypes[i] === 'folder') {
                if (itemIds[i] === targetFolderForMove) {
                    showNotification('error', "No se puede mover una carpeta dentro de sí misma.");
                    return;
                }
                const descendantIds = getDescendantFolderIds_local(itemIds[i], allFolders);
                if (targetFolderForMove !== null && descendantIds.includes(targetFolderForMove)) {
                    showNotification('error', `No se puede mover la carpeta "${allFolders.find(f=>f.id === itemIds[i])?.name}" a una de sus propias subcarpetas.`);
                    return;
                }
            }
        }
        onMoveItems(itemIds, itemTypes, targetFolderForMove);
    }
    setActiveModal(null);
    setSelectedItems({});
    setTargetFolderForMove(undefined);
  };

  const handleRenameItemSubmit = () => {
    if (itemToModify && renameInput.trim()) {
      if (itemToModify.type === 'file') {
        onRenameFile(itemToModify.id, renameInput.trim());
      } else {
        onRenameFolder(itemToModify.id, renameInput.trim());
      }
      setItemToModify(null);
      setRenameInput('');
      setActiveModal(null);
    }
  };

  const handleDuplicateFileAction = (file: AppFile) => {
    onDuplicateFile(file.id);
    setShowActionsMenu(null);
  }
  
  const openCreateFolderModal = () => { setNewFolderName(''); setActiveModal('createFolder'); };
  
  const openMoveModalForSingleItem = (item: AppFile | Folder, type: 'file' | 'folder') => {
    const originalParent = type === 'file' ? (item as AppFile).folderId : (item as Folder).parentId;
    setItemToModify({ id: item.id, name: item.name, type, originalParentId: originalParent });
    // For single item move, we are effectively moving one item, so let's make it a batch of one.
    setSelectedItems({ [item.id]: type });
    setTargetFolderForMove(originalParent === undefined ? null : originalParent);
    setActiveModal('moveItem');
    setShowActionsMenu(null);
  };

  const openMoveModalForBatch = () => {
    if (Object.keys(selectedItems).length === 0) return;
    // Determine a common "original" parent if possible, or default to current view, or root.
    // For simplicity, let's not pre-fill based on selection if it's diverse. Default to root.
    setTargetFolderForMove(null); // Default to root, user must select
    setActiveModal('moveItem');
  }
  
  const openDeleteItemModal = (item: {id: string, name: string}, type: 'file' | 'folder') => {
    const actionDetails: ConfirmActionDetails = {
        title: showTrashView ? "Eliminar Permanentemente" : "Mover a la Papelera",
        message: showTrashView 
            ? `¿Estás seguro de que quieres eliminar permanentemente ${type === 'folder' ? 'la carpeta' : 'el archivo'} "${item.name}"? Esta acción no se puede deshacer.`
            : `¿Estás seguro de que quieres mover ${type === 'folder' ? 'la carpeta' : 'el archivo'} "${item.name}" a la papelera?`,
        confirmText: showTrashView ? "Eliminar Permanentemente" : "Mover a Papelera",
        onConfirm: () => {
            if (showTrashView) {
                onPermanentDeleteItems([item.id], [type]);
            } else {
                onDeleteItems([item.id], [type]);
            }
            setSelectedItems({}); // Clear selection after action
        },
        itemType: type,
        itemName: item.name,
    };
    setConfirmActionDetails(actionDetails);
    setActiveModal('confirmAction');
    setShowActionsMenu(null);
  };

  const openRenameModal = (item: {id: string, name: string}, type: 'file' | 'folder') => {
    setItemToModify({ id: item.id, name: item.name, type });
    setRenameInput(item.name);
    setActiveModal('renameItem');
    setShowActionsMenu(null);
  }

  const processDroppedFiles = async (files: FileList, targetFolderId: string | null) => {
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExtension = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
        const isExcel = EXCEL_EXTENSIONS.includes(fileExtension) || EXCEL_MIME_TYPES.includes(file.type);
        const isDocx = fileExtension === '.docx' || file.type === DOCX_MIME_TYPE;
        const isTextLike = file.type.startsWith('text/') || 
                           file.type === 'application/json' ||
                           ['.csv', '.md', '.json', '.txt', '.xml', '.html', '.js', '.css', '.rtf'].some(ext => file.name.toLowerCase().endsWith(ext));
        
        if (isDocx) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const textContent = await parseDocxToText(arrayBuffer);
            onCreateFile(file.name, targetFolderId, textContent);
          } catch (error) { 
            console.error("Error processing DOCX file:", file.name, error); 
            showNotification('error', `Error al procesar el archivo DOCX ${file.name}. Es posible que el archivo esté corrupto o en un formato no compatible.`, "Fallo de Procesamiento");
          }
        } else if (isExcel) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const csvContent = await parseExcelToCsvString(arrayBuffer);
            if (csvContent) {
              onCreateFile(file.name, targetFolderId, csvContent);
            } else {
              showNotification('error', `No se pudo procesar la primera hoja del archivo Excel: ${file.name}. Puede estar vacío o en un formato no soportado.`);
            }
          } catch (error) { console.error("Error reading Excel file:", error); showNotification('error', `Error al leer el archivo Excel ${file.name}.`); }
        } else if (isTextLike) {
          try {
            const content = await file.text();
            onCreateFile(file.name, targetFolderId, content);
          } catch (error) { console.error("Error reading file:", error); showNotification('error', `Error al leer ${file.name}.`); }
        } else { 
          showNotification('error', `El tipo de archivo de ${file.name} no es admitido.`, "Subida Fallida"); 
        }
      }
    }
  };
  
  const handleZoneDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (showTrashView) return;
    if (event.dataTransfer.types.includes('Files')) { 
      const isInternalMove = event.dataTransfer.types.includes("application/vnd.internal-move");
      if (!isInternalMove) {
        setIsDraggingOverZone(true);
        setOsFileDragTargetId(currentFolderId); 
      }
    }
  }, [currentFolderId, showTrashView]);

  const handleZoneDragLeave = useCallback(() => {
    if (showTrashView) return;
    setIsDraggingOverZone(false);
    setOsFileDragTargetId(undefined);
  }, [showTrashView]);

  const handleZoneDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (showTrashView) return;
    setIsDraggingOverZone(false);
    setOsFileDragTargetId(undefined); 
    const internalMoveData = event.dataTransfer.getData("application/vnd.internal-move");
    if (internalMoveData) return; 
    await processDroppedFiles(event.dataTransfer.files, currentFolderId);
  }, [currentFolderId, processDroppedFiles, showTrashView]);

  const handleDragStart = (event: React.DragEvent<HTMLElement>, item: AppFile | Folder, type: 'file' | 'folder') => {
    if (showTrashView) { event.preventDefault(); return; } // Prevent dragging from trash
    const originalParentId = type === 'file' ? (item as AppFile).folderId : (item as Folder).parentId;
    event.dataTransfer.setData("application/vnd.internal-move", JSON.stringify({ id: item.id, type, name: item.name, originalParentId }));
    event.dataTransfer.effectAllowed = "move";
    setDraggingItemId(item.id);
    // setDraggingItemType(type); // not directly used but good for clarity
  };

  const handleDragEnd = () => {
    setDraggingItemId(null);
    // setDraggingItemType(null);
    setDropTargetFolderId(undefined);
    setOsFileDragTargetId(undefined);
  };

  const handleFolderItemDragOver = (event: React.DragEvent<HTMLDivElement>, targetFolderIdOver: string | null) => {
    event.preventDefault();
    if (showTrashView) return;
    event.dataTransfer.dropEffect = "move";
    const isOSFileDrag = event.dataTransfer.types.includes('Files') && !event.dataTransfer.types.includes("application/vnd.internal-move");

    if (isOSFileDrag) {
      setOsFileDragTargetId(targetFolderIdOver);
      setDropTargetFolderId(undefined); 
    } else if (draggingItemId && draggingItemId !== targetFolderIdOver) { 
        const draggedItemData = event.dataTransfer.getData("application/vnd.internal-move");
        if (!draggedItemData) return;
        try {
            const draggedItem = JSON.parse(draggedItemData);
            if (draggedItem.type === 'folder' && draggedItem.id === targetFolderIdOver) return; 
            setDropTargetFolderId(targetFolderIdOver);
            setOsFileDragTargetId(undefined); 
        } catch (e) {
            setDropTargetFolderId(undefined);
            setOsFileDragTargetId(undefined);
        }
    }
  };

  const handleFolderItemDragEnter = (event: React.DragEvent<HTMLDivElement>, targetFolderIdEnter: string | null) => {
    event.preventDefault();
    if (showTrashView) return;
    const isOSFileDrag = event.dataTransfer.types.includes('Files') && !event.dataTransfer.types.includes("application/vnd.internal-move");
    if (isOSFileDrag) {
        setOsFileDragTargetId(targetFolderIdEnter);
        setDropTargetFolderId(undefined);
    } else if (draggingItemId && draggingItemId !== targetFolderIdEnter) {
        setDropTargetFolderId(targetFolderIdEnter);
        setOsFileDragTargetId(undefined);
    }
  };

  const handleFolderItemDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (showTrashView) return;
    const relatedTarget = event.relatedTarget as Node;
    if (!event.currentTarget.contains(relatedTarget)) {
        setDropTargetFolderId(undefined);
        setOsFileDragTargetId(undefined);
    }
  };

  const handleFolderItemDrop = async (event: React.DragEvent<HTMLDivElement>, targetDropFolderId: string | null) => {
    event.preventDefault();
    event.stopPropagation(); 
    if (showTrashView) return;
    const isOSFileDrop = event.dataTransfer.files && event.dataTransfer.files.length > 0 && !event.dataTransfer.types.includes("application/vnd.internal-move");

    if (isOSFileDrop) {
        await processDroppedFiles(event.dataTransfer.files, targetDropFolderId);
    } else {
        const moveData = event.dataTransfer.getData("application/vnd.internal-move");
        if (!moveData) return;
        try {
            const { id: draggedItemIdFromDrop, type: draggedItemTypeFromDrop, originalParentId } = JSON.parse(moveData);
            if (draggedItemTypeFromDrop === 'folder' && draggedItemIdFromDrop === targetDropFolderId) {
              showNotification('error', "No se puede mover una carpeta dentro de sí misma.");
            } else if (originalParentId === targetDropFolderId) {
                showNotification('info', "El elemento ya se encuentra en esta carpeta/ubicación.");
            } else {
              onMoveItems([draggedItemIdFromDrop], [draggedItemTypeFromDrop], targetDropFolderId);
            }
        } catch(e) {
            console.error("Error processing internal move data", e);
            showNotification('error', "Error al procesar la acción de mover.");
        }
    }
    setDropTargetFolderId(undefined);
    setOsFileDragTargetId(undefined);
    setDraggingItemId(null); 
    // setDraggingItemType(null);
  };

  const getDescendantFolderIds_local = useCallback((folderId: string, folders: Folder[]): string[] => {
    let ids: string[] = [];
    const children = folders.filter(f => f.parentId === folderId);
    for (const child of children) {
        ids.push(child.id);
        ids = ids.concat(getDescendantFolderIds_local(child.id, folders));
    }
    return ids;
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setShowActionsMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  // Batch selection logic
  const toggleSelectItem = (itemId: string, itemType: 'file' | 'folder') => {
    setSelectedItems(prev => {
      const newSelected = { ...prev };
      if (newSelected[itemId]) {
        delete newSelected[itemId];
      } else {
        newSelected[itemId] = itemType;
      }
      return newSelected;
    });
  };

  const isAllSelected = () => {
    const currentViewItemsCount = displayedFolders.length + displayedFiles.length;
    return currentViewItemsCount > 0 && Object.keys(selectedItems).length === currentViewItemsCount;
  };

  const toggleSelectAll = () => {
    if (isAllSelected()) {
      setSelectedItems({});
    } else {
      const newSelectedItems: Record<string, 'file' | 'folder'> = {};
      displayedFolders.forEach(f => newSelectedItems[f.id] = 'folder');
      displayedFiles.forEach(f => newSelectedItems[f.id] = 'file');
      setSelectedItems(newSelectedItems);
    }
  };

  const handleBatchDelete = () => {
      const items = Object.keys(selectedItems);
      if (items.length === 0) return;
      const itemTypes = items.map(id => selectedItems[id]);
      const actionDetails: ConfirmActionDetails = {
          title: showTrashView ? "Eliminar Permanentemente Seleccionados" : "Mover Seleccionados a Papelera",
          message: showTrashView 
              ? `¿Estás seguro de que quieres eliminar permanentemente ${items.length} elemento(s) seleccionado(s)? Esta acción no se puede deshacer.`
              : `¿Estás seguro de que quieres mover ${items.length} elemento(s) seleccionado(s) a la papelera?`,
          confirmText: showTrashView ? "Eliminar Permanentemente" : "Mover a Papelera",
          onConfirm: () => {
              if (showTrashView) {
                  onPermanentDeleteItems(items, itemTypes);
              } else {
                  onDeleteItems(items, itemTypes);
              }
              setSelectedItems({});
          }
      };
      setConfirmActionDetails(actionDetails);
      setActiveModal('confirmAction');
  };

  const handleBatchRestore = () => {
      const items = Object.keys(selectedItems);
      if (items.length === 0 || !showTrashView) return;
      const itemTypes = items.map(id => selectedItems[id]);
      onRestoreItems(items, itemTypes);
      setSelectedItems({});
  };
  
  const handleToggleTrashView = () => {
    setShowTrashView(!showTrashView);
    setCurrentPathIds([]); // Reset path when switching to/from trash
    setSelectedItems({});
  };

  const Breadcrumbs = () => (
    <nav className="flex items-center text-sm text-slate-600 mb-4" aria-label="Breadcrumb">
      <div
        onDragOver={(e) => handleFolderItemDragOver(e, null)} 
        onDragEnter={(e) => handleFolderItemDragEnter(e, null)}
        onDragLeave={handleFolderItemDragLeave}
        onDrop={(e) => handleFolderItemDrop(e, null)}
        className={`p-1 rounded-md transition-colors duration-150 group
                    ${!showTrashView && dropTargetFolderId === null && draggingItemId ? 'bg-sky-100 border border-sky-300' : ''}
                    ${!showTrashView && osFileDragTargetId === null ? 'bg-green-100 border border-green-300' : ''}`}
      >
        <button
          onClick={() => { if (showTrashView) handleToggleTrashView(); else handleNavigate([]); }}
          className="flex items-center hover:text-sky-700 transition-colors duration-150"
          aria-label={showTrashView ? "Salir de Papelera" : "Ir a Archivos raíz"}
        >
          <HomeIcon className="w-5 h-5 mr-1.5 text-slate-500 group-hover:text-sky-700 transition-colors" />
          {showTrashView ? "Papelera" : "Archivos"}
        </button>
      </div>
      {!showTrashView && currentPathIds.map((folderId, index) => {
        const folderName = getFolderNameById(folderId);
        const isLast = index === currentPathIds.length - 1;
        return (
          <div key={folderId} className="flex items-center">
            <ChevronRightIcon className="w-4 h-4 mx-1.5 text-slate-400" />
             <div
                onDragOver={(e) => handleFolderItemDragOver(e, folderId)}
                onDragEnter={(e) => handleFolderItemDragEnter(e, folderId)}
                onDragLeave={handleFolderItemDragLeave}
                onDrop={(e) => handleFolderItemDrop(e, folderId)}
                className={`p-1 rounded-md transition-colors duration-150 group
                            ${!showTrashView && dropTargetFolderId === folderId && draggingItemId && draggingItemId !== folderId ? 'bg-sky-100 border border-sky-300' : ''}
                            ${!showTrashView && osFileDragTargetId === folderId ? 'bg-green-100 border border-green-300' : ''}`}
            >
            {isLast ? (
              <span className="font-medium text-slate-800 p-1">{folderName}</span>
            ) : (
              <button
                onClick={() => handleNavigate(currentPathIds.slice(0, index + 1))}
                className="hover:text-sky-700 transition-colors duration-150 p-1"
              >
                {folderName}
              </button>
            )}
            </div>
          </div>
        );
      })}
    </nav>
  );
  
  const dropZoneBaseClasses = "flex-grow p-6 bg-slate-100 h-full overflow-y-auto";
  const dropZoneDraggingClasses = "border-2 border-dashed border-sky-400 bg-sky-50/70";

  const renderItemActions = (item: AppFile | Folder, type: 'file' | 'folder') => (
    <div className="relative ml-auto" ref={item.id === showActionsMenu ? actionsMenuRef : null}>
      <Button
        variant="ghost"
        size="sm"
        className="p-1 text-slate-500 hover:text-slate-800 focus:text-slate-800 transition-opacity opacity-0 group-hover:opacity-100 focus-within:opacity-100"
        onClick={(e) => { e.stopPropagation(); setShowActionsMenu(showActionsMenu === item.id ? null : item.id);}}
        aria-label={`Acciones para ${item.name}`}
      >
        <EllipsisVerticalIcon className="w-5 h-5" />
      </Button>
      {showActionsMenu === item.id && (
        <div className="absolute right-0 mt-1 w-52 bg-white rounded-md shadow-xl z-20 border border-slate-200 py-1">
          {showTrashView ? (
            <>
              <button onClick={(e) => { e.stopPropagation(); onRestoreItems([item.id], [type]); setSelectedItems({}); setShowActionsMenu(null); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center transition-colors duration-150">
                <RefreshIcon className="w-4 h-4 mr-2.5 text-slate-500" /> Restaurar
              </button>
              <div className="my-1 border-t border-slate-100"></div>
              <button onClick={(e) => { e.stopPropagation(); openDeleteItemModal(item, type); }} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center transition-colors duration-150">
                <TrashIcon className="w-4 h-4 mr-2.5" /> Eliminar Permanentemente
              </button>
            </>
          ) : (
            <>
              <button onClick={(e) => { e.stopPropagation(); openRenameModal(item, type); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center transition-colors duration-150">
                <PencilIcon className="w-4 h-4 mr-2.5 text-slate-500" /> Renombrar
              </button>
              <button onClick={(e) => { e.stopPropagation(); openMoveModalForSingleItem(item, type); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center transition-colors duration-150">
                <ArrowPathIcon className="w-4 h-4 mr-2.5 text-slate-500" /> Mover
              </button>
              {type === 'file' && (
                <button onClick={(e) => { e.stopPropagation(); handleDuplicateFileAction(item as AppFile); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center transition-colors duration-150">
                  <DocumentDuplicateIcon className="w-4 h-4 mr-2.5 text-slate-500" /> Duplicar
                </button>
              )}
              <div className="my-1 border-t border-slate-100"></div>
              <button onClick={(e) => { e.stopPropagation(); openDeleteItemModal(item, type); }} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center transition-colors duration-150">
                <ArchiveBoxArrowDownIcon className="w-4 h-4 mr-2.5" /> Mover a Papelera
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
  
  const numSelected = Object.keys(selectedItems).length;

  return (
    <div 
      className={`${dropZoneBaseClasses} ${isDraggingOverZone && !draggingItemId && osFileDragTargetId !== undefined && !showTrashView ? dropZoneDraggingClasses : 'border-2 border-transparent'}`}
      onDragOver={handleZoneDragOver}
      onDragLeave={handleZoneDragLeave}
      onDrop={handleZoneDrop}
    >
      <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <Breadcrumbs />
        <div className="space-x-3 mt-3 sm:mt-0 flex-shrink-0">
          {!showTrashView && (
            <>
            <Button 
              onClick={() => fileUploadInputRef.current?.click()}
              variant="secondary" 
              leftIcon={<UploadIcon className="w-4 h-4"/>} 
              size="sm"
            >
              Subir Archivos
            </Button>
            <input 
              type="file" 
              ref={fileUploadInputRef} 
              multiple 
              className="hidden" 
              onChange={async (e) => {
                if (e.target.files) {
                  await processDroppedFiles(e.target.files, currentFolderId);
                  if(e.target) e.target.value = ''; 
                }
              }}
              accept=".txt,.csv,.md,.json,text/plain,text/csv,application/json,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            />
            <Button onClick={openCreateFolderModal} variant="secondary" leftIcon={<PlusIcon className="w-4 h-4"/>} size="sm">Nueva Carpeta</Button>
            </>
          )}
          <Button 
            onClick={handleToggleTrashView} 
            variant="ghost" 
            leftIcon={showTrashView ? <HomeIcon className="w-4 h-4"/> : <TrashIcon className="w-4 h-4"/>} 
            size="sm"
            className="text-slate-600 hover:text-sky-700"
            title={showTrashView ? "Volver a Archivos" : "Ver Papelera"}
          >
            {showTrashView ? "Volver a Archivos" : "Papelera"}
          </Button>
        </div>
      </header>

      {/* Batch Action Bar */}
      {numSelected > 0 && (
        <div className="sticky top-0 z-10 bg-slate-100/80 backdrop-blur-sm p-3 mb-4 rounded-lg shadow-md border border-slate-200">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">{numSelected} elemento(s) seleccionado(s)</p>
            <div className="space-x-2">
              {showTrashView ? (
                <>
                  <Button onClick={handleBatchRestore} size="sm" variant="secondary" leftIcon={<RefreshIcon className="w-4 h-4"/>}>Restaurar</Button>
                  <Button onClick={handleBatchDelete} size="sm" variant="danger" leftIcon={<TrashIcon className="w-4 h-4"/>}>Eliminar Permanentemente</Button>
                </>
              ) : (
                <>
                  <Button onClick={openMoveModalForBatch} size="sm" variant="secondary" leftIcon={<ArrowPathIcon className="w-4 h-4"/>}>Mover</Button>
                  <Button onClick={handleBatchDelete} size="sm" variant="danger" leftIcon={<ArchiveBoxArrowDownIcon className="w-4 h-4"/>}>Mover a Papelera</Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}


      {isDraggingOverZone && !draggingItemId && osFileDragTargetId !== undefined && !showTrashView && ( 
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-0 flex flex-col items-center justify-center bg-sky-100 bg-opacity-80 z-10 mx-auto my-auto rounded-lg" style={{ left: '1rem', right: '1rem', top: '1rem', bottom: '1rem' }}>
          <UploadIcon className="w-12 h-12 text-sky-500 mb-3 animate-bounce" />
          <p className="text-lg font-medium text-sky-600">Suelta los archivos aquí para subirlos a {osFileDragTargetId === null ? "la raíz" : `la carpeta "${getFolderNameById(osFileDragTargetId) || 'actual'}"` }</p>
        </div>
      )}
      
      {/* Select All Checkbox */}
      {(displayedFiles.length > 0 || displayedFolders.length > 0) && (
        <div className="mb-3 pb-2 border-b border-slate-200">
          <label className="flex items-center space-x-2 text-sm text-slate-600 hover:text-slate-800 cursor-pointer w-fit">
            <input 
              type="checkbox" 
              className="form-checkbox h-4 w-4 text-sky-600 border-slate-300 rounded focus:ring-sky-500"
              checked={isAllSelected()}
              onChange={toggleSelectAll}
              aria-label="Seleccionar todos los elementos visibles"
            />
            <span>Seleccionar Todo</span>
          </label>
        </div>
      )}

      {displayedFolders.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Carpetas ({displayedFolders.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {displayedFolders.map(folder => (
              <div
                key={folder.id}
                draggable={!showTrashView}
                onDragStart={(e) => handleDragStart(e, folder, 'folder')}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleFolderItemDragOver(e, folder.id)}
                onDragEnter={(e) => handleFolderItemDragEnter(e, folder.id)}
                onDragLeave={handleFolderItemDragLeave}
                onDrop={(e) => handleFolderItemDrop(e, folder.id)}
                onClick={(e) => { 
                  if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') return; // Prevent navigation if checkbox is clicked
                  handleFolderClick(folder.id); 
                }}
                title={showTrashView ? folder.name : `Abrir carpeta ${folder.name}`}
                className={`bg-white p-3 rounded-lg shadow hover:shadow-lg transition-all duration-150 ease-in-out border flex items-center space-x-3 relative group 
                            ${showTrashView ? 'cursor-default' : 'cursor-pointer'}
                            ${draggingItemId === folder.id && !showTrashView ? 'opacity-50 ring-2 ring-offset-1 ring-slate-400' : ''}
                            ${dropTargetFolderId === folder.id && draggingItemId && draggingItemId !== folder.id && !showTrashView ? 'ring-2 ring-offset-1 ring-sky-400 bg-sky-50/70' : 'border-slate-200 hover:border-slate-300'}
                            ${osFileDragTargetId === folder.id && !showTrashView ? 'ring-2 ring-offset-1 ring-green-400 bg-green-50/70' : ''}
                            ${selectedItems[folder.id] ? 'ring-2 ring-sky-500 border-sky-500 bg-sky-50/50' : 'border-slate-200'}`}
              >
                <input 
                  type="checkbox" 
                  className="form-checkbox h-4 w-4 text-sky-600 border-slate-300 rounded focus:ring-sky-500 flex-shrink-0"
                  checked={!!selectedItems[folder.id]}
                  onChange={() => toggleSelectItem(folder.id, 'folder')}
                  onClick={(e) => e.stopPropagation()} // Prevent div click event
                  aria-label={`Seleccionar carpeta ${folder.name}`}
                />
                <FolderIcon className="w-10 h-10 text-sky-500 flex-shrink-0" />
                <span className="text-slate-700 font-medium truncate flex-grow text-sm">{folder.name}</span>
                {renderItemActions(folder, 'folder')}
              </div>
            ))}
          </div>
        </section>
      )}
      
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Archivos ({displayedFiles.length})</h2>
        {displayedFiles.length > 0 ? (
          <ul className="space-y-2.5">
            {displayedFiles.map(file => {
              const fileExtension = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
              const isExcelFile = EXCEL_EXTENSIONS.includes(fileExtension);
              const isDocxFile = fileExtension === '.docx';
              let CurrentFileIcon = FileIcon;
              let iconColor = "text-emerald-600";

              if (isDocxFile) { CurrentFileIcon = DocxFileIcon; iconColor = "text-blue-600"; } 
              else if (isExcelFile) { CurrentFileIcon = ExcelFileIcon; iconColor = "text-green-600"; }

              return (
                <li
                  key={file.id}
                  draggable={!showTrashView}
                  onDragStart={(e) => handleDragStart(e, file, 'file')}
                  onDragEnd={handleDragEnd}
                  onClick={(e) => {
                     if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') return;
                     if (!showTrashView) onSelectFile(file.id);
                  }}
                  title={showTrashView ? file.name : `Abrir archivo ${file.name}`}
                  className={`flex items-center space-x-3 p-3 bg-white rounded-lg shadow hover:shadow-lg transition-all duration-150 ease-in-out border relative group 
                              ${showTrashView ? 'cursor-default' : 'cursor-pointer'}
                              ${activeFileId === file.id && !showTrashView ? 'border-sky-500 bg-sky-50/60 ring-1 ring-sky-500' : ''}
                              ${draggingItemId === file.id && !showTrashView ? 'opacity-50 ring-2 ring-offset-1 ring-slate-400' : ''}
                              ${selectedItems[file.id] ? 'ring-2 ring-sky-500 border-sky-500 bg-sky-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <input 
                    type="checkbox" 
                    className="form-checkbox h-4 w-4 text-sky-600 border-slate-300 rounded focus:ring-sky-500 flex-shrink-0"
                    checked={!!selectedItems[file.id]}
                    onChange={() => toggleSelectItem(file.id, 'file')}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Seleccionar archivo ${file.name}`}
                  />
                  <CurrentFileIcon className={`w-5 h-5 ${iconColor} flex-shrink-0`} />
                  <span className="text-slate-700 font-medium truncate flex-grow text-sm">{file.name}</span>
                  <span className="text-xs text-slate-500 mr-2 flex-shrink-0">{new Date(file.createdAt).toLocaleDateString()}</span>
                  {renderItemActions(file, 'file')}
                </li>
              );
            })}
          </ul>
        ) : (
          (displayedFolders.length === 0 && !isDraggingOverZone && draggingItemId === null && osFileDragTargetId === undefined) && (
            <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-slate-200">
              <svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-slate-800">{showTrashView ? "La Papelera está vacía" : "Carpeta Vacía"}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {showTrashView ? "Cuando elimines archivos o carpetas, aparecerán aquí." : "Comienza arrastrando archivos aquí o usa el botón \"Subir Archivos\"."}
              </p>
            </div>
          )
        )}
      </section>

      <Modal 
        isOpen={activeModal === 'createFolder'} 
        onClose={() => setActiveModal(null)} 
        title={`Crear Nueva Carpeta en "${currentFolderId ? getFolderNameById(currentFolderId) : 'Archivos'}"`}
        footer={<><Button variant="secondary" onClick={() => setActiveModal(null)}>Cancelar</Button><Button variant="primary" onClick={handleCreateFolderSubmit} disabled={!newFolderName.trim()}>Crear</Button></>}
      >
        <label htmlFor="folderName" className="block text-sm font-medium text-slate-700 mb-1">Nombre de la Carpeta</label>
        <input type="text" id="folderName" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Ej. Facturas 2024" className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500" autoFocus/>
      </Modal>

      {(activeModal === 'moveItem') && (
        <Modal 
            isOpen={true} 
            onClose={() => { setActiveModal(null); setItemToModify(null); setSelectedItems({}); setTargetFolderForMove(undefined); }} 
            title={`Mover ${Object.keys(selectedItems).length > 1 ? `${Object.keys(selectedItems).length} elementos` : (itemToModify?.name || "elemento")}`}
            footer={<><Button variant="secondary" onClick={() => { setActiveModal(null); setItemToModify(null); setSelectedItems({}); setTargetFolderForMove(undefined); }}>Cancelar</Button><Button variant="primary" onClick={handleMoveSelectedItems} disabled={targetFolderForMove === undefined}>Mover</Button></>}
        >
            <label htmlFor="destinationFolderMove" className="block text-sm font-medium text-slate-700 mb-1">Selecciona la carpeta de destino:</label>
            <select 
              id="destinationFolderMove" 
              value={targetFolderForMove === null ? "__root__" : targetFolderForMove || ""} 
              onChange={(e) => setTargetFolderForMove(e.target.value === "__root__" ? null : e.target.value)} 
              className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white"
            >
                <option value="__root__">Archivos (Raíz)</option>
                {allFolders
                    .filter(folder => !folder.deletedAt) // Only show non-deleted folders as targets
                    .filter(folder => {
                        // Prevent moving a folder into itself or its descendants
                        const selectedFolderIds = Object.keys(selectedItems).filter(id => selectedItems[id] === 'folder');
                        if (selectedFolderIds.includes(folder.id)) return false; // Cannot move to one of the selected folders itself
                        for (const selectedFolderId of selectedFolderIds) {
                            if (folder.id === selectedFolderId) return false;
                            const descendantIds = getDescendantFolderIds_local(selectedFolderId, allFolders);
                            if (descendantIds.includes(folder.id)) return false;
                        }
                        return true;
                    })
                    .map(folder => (<option key={folder.id} value={folder.id}>{getFolderNameById(folder.id) || "Carpeta sin nombre"}</option>))}
            </select>
             {/* Logic to check if already in target:
              Object.keys(selectedItems).every(id => 
                (selectedItems[id] === 'file' && allFiles.find(f=>f.id===id)?.folderId === targetFolderForMove) ||
                (selectedItems[id] === 'folder' && allFolders.find(f=>f.id===id)?.parentId === targetFolderForMove)
              ) && <p className="text-xs text-red-500 mt-1">Todos los elementos seleccionados ya están en esta carpeta.</p> 
            */}
        </Modal>
      )}

      {itemToModify && activeModal === 'renameItem' && (
        <Modal 
            isOpen={true} 
            onClose={() => { setActiveModal(null); setItemToModify(null); setRenameInput(''); }} 
            title={`Renombrar ${itemToModify.type === 'folder' ? 'Carpeta' : 'Archivo'}`}
            footer={<><Button variant="secondary" onClick={() => { setActiveModal(null); setItemToModify(null); setRenameInput(''); }}>Cancelar</Button><Button variant="primary" onClick={handleRenameItemSubmit} disabled={!renameInput.trim() || renameInput.trim() === itemToModify.name}>Renombrar</Button></>}
        >
            <label htmlFor="itemName" className="block text-sm font-medium text-slate-700 mb-1">Nuevo nombre para <span className="font-semibold">"{itemToModify.name}"</span>:</label>
            <input type="text" id="itemName" value={renameInput} onChange={(e) => setRenameInput(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500" autoFocus onKeyPress={(e) => { if (e.key === 'Enter' && renameInput.trim() && renameInput.trim() !== itemToModify.name) handleRenameItemSubmit();}}/>
        </Modal>
      )}

      {activeModal === 'confirmAction' && confirmActionDetails && (
        <Modal 
            isOpen={true} 
            onClose={() => { setActiveModal(null); setConfirmActionDetails(null); }} 
            title={confirmActionDetails.title}
            footer={<><Button variant="secondary" onClick={() => { setActiveModal(null); setConfirmActionDetails(null); }}>Cancelar</Button><Button variant={confirmActionDetails.title.toLowerCase().includes("permanentemente") ? "danger" : "primary"} onClick={() => { confirmActionDetails.onConfirm(); setActiveModal(null); setConfirmActionDetails(null);}}>{confirmActionDetails.confirmText}</Button></>}
        >
            <p className="text-slate-700">{confirmActionDetails.message}</p>
            {confirmActionDetails.itemType === 'folder' && (confirmActionDetails.title.toLowerCase().includes("papelera") || confirmActionDetails.title.toLowerCase().includes("permanentemente")) && (
                <p className="mt-2 text-sm text-red-600">¡Atención! Todos los archivos y subcarpetas dentro de esta carpeta (y sus subcarpetas) también serán {confirmActionDetails.title.toLowerCase().includes("permanentemente") ? "eliminados permanentemente" : "movidos a la papelera"}.</p>
            )}
             {confirmActionDetails.message.toLowerCase().includes("elemento(s) seleccionado(s)") && confirmActionDetails.itemType !== 'folder' && (confirmActionDetails.title.toLowerCase().includes("papelera") || confirmActionDetails.title.toLowerCase().includes("permanentemente")) && (
                <p className="mt-2 text-sm text-red-600">¡Atención! Si alguna selección incluye carpetas, su contenido también será afectado.</p>
            )}
        </Modal>
      )}

    </div>
  );
};