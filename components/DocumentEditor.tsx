
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from './Button';
import { ArrowDownTrayIcon, ArrowUturnLeftIcon, FileIcon as DocumentIconFallback, PlusIcon, ArrowUturnRightIcon, InfoCircleIcon, TrashIcon, ArrowUpCircleIcon, ArrowDownCircleIcon, ArrowLeftCircleIcon, ArrowRightCircleIcon, PlusCircleIcon } from './icons'; 
import { AppFile } from '../types';
import { parseCsv, serializeCsv, ParsedCsvData, convertCsvDataToExcelArrayBuffer } from '../utils/tabularDataParser';

interface DocumentEditorProps {
  fileName: string | null;
  content: string;
  onContentChange: (newContent: string) => void;
  isCollaborating: boolean;
  activeFile: AppFile | undefined;
  previousDocumentContentForUndo: string | null; 
  onUndoAIChange: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onGoBack: () => void; 
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetType: 'row' | 'column' | null;
  targetIndex: number | null; // rowIndex for 'row', colIndex for 'column'
}

const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];
const DOCX_EXTENSIONS = ['.docx'];

export const DocumentEditor: React.FC<DocumentEditorProps> = ({ 
  fileName, 
  content, 
  onContentChange, 
  isCollaborating, 
  activeFile,
  previousDocumentContentForUndo,
  onUndoAIChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onGoBack
}) => {
  const [isCsvMode, setIsCsvMode] = useState(false); 
  const [isExcelFile, setIsExcelFile] = useState(false);
  const [isDocxFile, setIsDocxFile] = useState(false); 
  const [parsedCsvData, setParsedCsvData] = useState<ParsedCsvData | null>(null);
  const [csvParsingError, setCsvParsingError] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    targetType: null,
    targetIndex: null,
  });

  useEffect(() => {
    if (activeFile) {
      const fileExtension = `.${activeFile.name.split('.').pop()?.toLowerCase() || ''}`;
      const isOriginallyExcel = EXCEL_EXTENSIONS.includes(fileExtension);
      const isOriginallyDocx = DOCX_EXTENSIONS.includes(fileExtension);
      
      setIsExcelFile(isOriginallyExcel);
      setIsDocxFile(isOriginallyDocx);

      if (isOriginallyDocx) {
        setIsCsvMode(false); // DOCX is plain text for editor
        setParsedCsvData(null);
        setCsvParsingError(null);
      } else if (fileExtension === '.csv' || isOriginallyExcel) {
        setIsCsvMode(true); 
        try {
          const parsed = parseCsv(content);
          if (parsed) {
            setParsedCsvData(parsed);
            setCsvParsingError(null);
          } else {
            setParsedCsvData(null);
            setCsvParsingError(isOriginallyExcel ? "La primera hoja del archivo Excel está vacía o no pudo ser procesada." : "El archivo CSV está vacío o tiene un formato de cabecera inválido.");
          }
        } catch (error) {
          console.error("Error parsing CSV/Excel content:", error);
          setParsedCsvData(null);
          setCsvParsingError(`Error al procesar contenido tabular: ${error instanceof Error ? error.message : 'Error desconocido'}.`);
        }
      } else { // Plain text files
        setIsCsvMode(false);
        setIsExcelFile(false); // Should be redundant but safe
        setIsDocxFile(false);  // Should be redundant but safe
        setParsedCsvData(null);
        setCsvParsingError(null);
      }
    } else { // No active file
      setIsCsvMode(false);
      setIsExcelFile(false);
      setIsDocxFile(false);
      setParsedCsvData(null);
      setCsvParsingError(null);
    }
    setContextMenu({ visible: false, x: 0, y: 0, targetType: null, targetIndex: null });
  }, [activeFile, content]);

  const handleCellEdit = (rowIndex: number, colIndex: number, value: string) => {
    if (!parsedCsvData || isCollaborating) return;

    const newRows = parsedCsvData.rows.map((row, rIdx) => 
      rIdx === rowIndex 
        ? row.map((cell, cIdx) => (cIdx === colIndex ? value : cell)) 
        : row
    );
    
    const newData = { ...parsedCsvData, rows: newRows };
    setParsedCsvData(newData); 
    onContentChange(serializeCsv(newData));
  };

  const handleDownload = async () => {
    if (!activeFile) return;
    if (isCsvMode && !parsedCsvData && !isCollaborating) return; // Don't download if CSV/Excel data isn't parsed and not collaborating

    let blob: Blob;
    let downloadFileName = activeFile.name || 'documento';

    if (isDocxFile) {
      blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8;' });
      downloadFileName = downloadFileName.substring(0, downloadFileName.lastIndexOf('.')) + '.txt';
    } else if (isExcelFile && parsedCsvData) { 
      const excelBuffer = await convertCsvDataToExcelArrayBuffer(parsedCsvData);
      blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      if (!downloadFileName.toLowerCase().endsWith('.xlsx')) {
        downloadFileName = downloadFileName.substring(0, downloadFileName.lastIndexOf('.')) + '.xlsx';
      }
    } else if (isCsvMode && parsedCsvData) { 
      blob = new Blob([serializeCsv(parsedCsvData)], { type: 'text/csv;charset=utf-8;' });
    } else { // Plain text for other file types or Docx content
      blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8;' });
    }
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const showContextMenu = (event: React.MouseEvent, type: 'row' | 'column', index: number) => {
    event.preventDefault();
    if (isCollaborating) return;
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      targetType: type,
      targetIndex: index,
    });
  };

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenu.visible && contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        closeContextMenu();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu.visible, closeContextMenu]);

  const modifyCsvData = (modifier: (data: ParsedCsvData) => ParsedCsvData | null) => {
    if (!parsedCsvData) return;
    const dataToModify: ParsedCsvData = {
      headers: [...parsedCsvData.headers],
      rows: parsedCsvData.rows.map(row => [...row])
    };
    const newData = modifier(dataToModify);
    if (newData) {
      setParsedCsvData(newData);
      onContentChange(serializeCsv(newData));
    }
    closeContextMenu();
  };

  const handleInsertRow = (above: boolean) => {
    if (contextMenu.targetType !== 'row' || contextMenu.targetIndex === null) return;
    const rowIndex = contextMenu.targetIndex;
    modifyCsvData(data => {
      const newEmptyRow = Array(data.headers.length).fill('');
      data.rows.splice(above ? rowIndex : rowIndex + 1, 0, newEmptyRow);
      return data; 
    });
  };

  const handleDeleteRow = () => {
    if (contextMenu.targetType !== 'row' || contextMenu.targetIndex === null || !parsedCsvData) return;
    const rowIndex = contextMenu.targetIndex;
    modifyCsvData(data => {
        if (data.rows.length > 0 && rowIndex >= 0 && rowIndex < data.rows.length) {
            data.rows.splice(rowIndex, 1);
            if (data.rows.length === 0) {
                 data.rows.push(Array(data.headers.length).fill(''));
            }
        }
        return data; 
    });
  };
  
  const handleInsertColumn = (before: boolean) => {
    if (contextMenu.targetType !== 'column' || contextMenu.targetIndex === null) return;
    const colIndex = contextMenu.targetIndex;
    modifyCsvData(data => {
      data.headers.splice(before ? colIndex : colIndex + 1, 0, 'NuevaCol');
      data.rows.forEach(row => {
        row.splice(before ? colIndex : colIndex + 1, 0, '');
      });
      return data; 
    });
  };

  const handleDeleteColumn = () => {
    if (contextMenu.targetType !== 'column' || contextMenu.targetIndex === null || !parsedCsvData) return;
    const colIndex = contextMenu.targetIndex;
    modifyCsvData(data => {
      if (data.headers.length > 1) { 
        data.headers.splice(colIndex, 1);
        data.rows.forEach(row => {
          if (colIndex < row.length) { 
            row.splice(colIndex, 1);
          }
        });
      }
      return data; 
    });
  };

  const getStatusInfo = () => {
    let fileType = 'Texto Plano';
    if (isDocxFile) fileType = 'Documento Word (Texto)';
    else if (isExcelFile) fileType = 'Documento Excel';
    else if (isCsvMode) fileType = 'Documento CSV';
    
    let contentInfo = '';
    if (isCsvMode) { 
      if (parsedCsvData) {
        contentInfo = `${parsedCsvData.rows.length} filas, ${parsedCsvData.headers.length} columnas`;
      } else if (csvParsingError) {
        contentInfo = 'Error en datos tabulares';
      }
    } else { // Plain text or Docx (shown as plain text)
      contentInfo = `${content.length} caracteres`;
    }
    const collaborationStatusText = isCollaborating ? 'AI está actualizando...' : ''; 
    return { fileType, contentInfo, collaborationStatusText };
  };

  const { fileType, contentInfo, collaborationStatusText } = getStatusInfo();


  if (!fileName || !activeFile) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center bg-slate-50 min-w-0">
        <div className="text-center">
          <DocumentIconFallback className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-700">No hay documento seleccionado</h3>
          <p className="text-base text-slate-500 mt-1">Por favor, crea o selecciona un documento.</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (isCsvMode) { 
      if (csvParsingError) {
        return (
          <div className="flex-1 flex flex-col p-2 bg-white rounded-lg border border-slate-200 shadow-inner min-h-0">
            <div className="p-3 mb-3 bg-red-100 border border-red-300 text-red-700 rounded-md text-sm">
              <strong className="font-semibold">Error al procesar datos tabulares:</strong> {csvParsingError}
              <p className="text-xs mt-1">Se muestra el contenido original como texto. Los cambios se guardarán, pero la vista tabular no está disponible.</p>
            </div>
            <textarea
              value={content} 
              onChange={(e) => onContentChange(e.target.value)} 
              className="w-full flex-1 p-3 border border-slate-300 rounded-md resize-none leading-relaxed font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50 text-slate-700"
              aria-label={`Contenido original del archivo ${fileName} con error`}
              disabled={isCollaborating}
            />
          </div>
        );
      }
      if (parsedCsvData) {
        return (
          <div className="w-full overflow-auto rounded-lg border border-slate-300 shadow-sm min-h-0 flex-1 relative"> 
            <table className="min-w-full text-sm border-collapse bg-white">
              <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th 
                    scope="col"
                    className="sticky top-0 left-0 z-20 px-2 py-2.5 text-center font-semibold text-slate-600 bg-slate-200 border-b border-r border-slate-300 w-12 select-none"
                    aria-label="Número de fila"
                  >
                    {/* Intentionally empty or use # */}
                  </th>
                  {parsedCsvData.headers.map((header, index) => (
                    <th 
                      key={index} 
                      scope="col"
                      className="sticky top-0 px-3.5 py-2.5 text-left font-semibold text-slate-700 border-b border-r border-slate-300 whitespace-nowrap"
                      style={{ zIndex: 10 }}
                      onContextMenu={(e) => showContextMenu(e, 'column', index)}
                      aria-label={`Columna ${header || index + 1}, clic derecho para opciones`}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedCsvData.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-slate-50 transition-colors duration-100 even:bg-slate-50/50">
                    <td
                      className="sticky left-0 z-10 px-2 py-2.5 text-center text-slate-600 bg-slate-100 hover:bg-slate-200 border-b border-r border-slate-300 font-medium select-none w-12 cursor-default"
                      onContextMenu={(e) => showContextMenu(e, 'row', rowIndex)}
                      aria-label={`Fila ${rowIndex + 1}, clic derecho para opciones de fila`}
                    >
                      {rowIndex + 1}
                    </td>
                    {row.map((cell, colIndex) => (
                      <td
                        key={colIndex}
                        contentEditable={!isCollaborating}
                        onBlur={(e) => handleCellEdit(rowIndex, colIndex, e.currentTarget.textContent || '')}
                        suppressContentEditableWarning={true}
                        className="px-3.5 py-2.5 text-slate-700 border-b border-r border-slate-300 whitespace-nowrap focus:outline-none focus:ring-1 focus:ring-sky-400 focus:bg-sky-50"
                        onContextMenu={(e) => showContextMenu(e, 'row', rowIndex)} 
                        aria-label={`Fila ${rowIndex + 1}, Columna ${parsedCsvData.headers[colIndex] || colIndex + 1}, valor ${cell}, clic derecho para opciones de fila`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
    }
    // Fallback to plain text editor for non-CSV/Excel files, and for DOCX files
    return (
      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        placeholder="Empieza a escribir tu documento aquí..."
        className="w-full flex-1 p-3.5 border border-slate-300 rounded-lg resize-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 text-slate-800 bg-white leading-relaxed font-sans text-base placeholder-slate-400 min-h-0"
        disabled={isCollaborating}
        aria-label={`Contenido del documento ${fileName}`}
      />
    );
  };

  const renderContextMenu = () => {
    if (!contextMenu.visible || contextMenu.targetIndex === null || !isCsvMode) return null;

    const menuItems = [];
    if (contextMenu.targetType === 'row') {
      menuItems.push(
        <button key="insert-above" onClick={() => handleInsertRow(true)} className="flex items-center w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"><ArrowUpCircleIcon className="w-4 h-4 mr-2.5" /> Insertar fila arriba</button>,
        <button key="insert-below" onClick={() => handleInsertRow(false)} className="flex items-center w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"><ArrowDownCircleIcon className="w-4 h-4 mr-2.5" /> Insertar fila abajo</button>,
        <div key="divider-row" className="my-1 border-t border-slate-100"></div>,
        <button key="delete-row" onClick={handleDeleteRow} className="flex items-center w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"><TrashIcon className="w-4 h-4 mr-2.5" /> Eliminar fila</button>
      );
    } else if (contextMenu.targetType === 'column') {
      menuItems.push(
        <button key="insert-left" onClick={() => handleInsertColumn(true)} className="flex items-center w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"><ArrowLeftCircleIcon className="w-4 h-4 mr-2.5" /> Insertar columna a la izquierda</button>,
        <button key="insert-right" onClick={() => handleInsertColumn(false)} className="flex items-center w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"><ArrowRightCircleIcon className="w-4 h-4 mr-2.5" /> Insertar columna a la derecha</button>,
        <div key="divider-col" className="my-1 border-t border-slate-100"></div>,
        <button key="delete-col" onClick={handleDeleteColumn} className="flex items-center w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors" disabled={parsedCsvData && parsedCsvData.headers.length <=1}><TrashIcon className="w-4 h-4 mr-2.5" /> Eliminar columna</button>
      );
    }

    return (
      <div
        ref={contextMenuRef}
        className="absolute z-50 w-60 bg-white rounded-md shadow-xl border border-slate-200 py-1"
        style={{ top: contextMenu.y, left: contextMenu.x }}
        onClick={(e) => e.stopPropagation()} 
      >
        {menuItems}
      </div>
    );
  };


  return (
    <div className="flex-1 p-5 sm:p-6 flex flex-col bg-slate-50 min-w-0 h-full relative">
      {/* Header Section */}
      <div className="mb-4 pb-4 border-b border-slate-200 flex flex-col gap-3">

        {/* Row 1: Back Button and Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          {/* Back Button - aligned to the start of this row */}
          <div className="flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onGoBack}
              leftIcon={<ArrowUturnLeftIcon className="w-5 h-5" />}
              title="Volver al explorador de archivos"
              className="text-slate-700 hover:text-sky-700 hover:bg-sky-50"
              aria-label="Regresar al explorador de archivos"
            >
              Regresar
            </Button>
          </div>

          {/* Action Buttons Group - aligned to the end of this row on sm+ */}
          <div className='flex flex-wrap items-center gap-x-2.5 gap-y-2 justify-start sm:justify-end flex-shrink-0'>
            {isCollaborating && (
              <div className="flex items-center text-sm text-sky-600 font-medium px-2 py-1 bg-sky-100 rounded-md">
                <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5 mr-2 text-sky-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                AI está actualizando...
              </div>
            )}
            {previousDocumentContentForUndo !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onUndoAIChange}
                leftIcon={<ArrowUturnLeftIcon className="w-4 h-4" />}
                title="Deshacer último cambio de IA"
                className="text-slate-600 hover:text-sky-700 hover:bg-sky-50"
              >
                Deshacer IA
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onUndo}
              disabled={!canUndo || isCollaborating}
              leftIcon={<ArrowUturnLeftIcon className="w-4 h-4" />}
              title="Deshacer último cambio"
              className="text-slate-600 hover:text-sky-700 hover:bg-sky-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Deshacer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRedo}
              disabled={!canRedo || isCollaborating}
              leftIcon={<ArrowUturnRightIcon className="w-4 h-4" />}
              title="Rehacer último cambio"
              className="text-slate-600 hover:text-sky-700 hover:bg-sky-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Rehacer
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownload}
              leftIcon={<ArrowDownTrayIcon className="w-4 h-4" />}
              title={`Descargar ${fileName}`}
              disabled={(isCsvMode && !parsedCsvData && !isCollaborating) || (!activeFile)}
            >
              Descargar
            </Button>
          </div>
        </div>

        {/* Row 2: File Name */}
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-800 truncate pt-1">
            {fileName}
          </h2>
        </div>
      </div>
      
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto bg-white rounded-lg shadow-sm border border-slate-200">
        {renderContent()}
      </div>
      
      <div className="text-xs text-slate-600 mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
                <InfoCircleIcon className="w-4 h-4 text-slate-400"/>
                {fileType}
            </span>
            <span className="text-slate-400">|</span>
            <span>{contentInfo}</span>
        </div>
        <div className={`flex items-center gap-1 ${isCollaborating ? 'text-sky-600 font-medium' : 'text-slate-500'}`}>
           {collaborationStatusText}
           {isCollaborating &&  <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse"></div> }
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-1.5">
        {isCsvMode && parsedCsvData && !csvParsingError ? 
         (isCollaborating ? '' : 'Los cambios se guardan al salir de la celda. Haz clic derecho en la tabla para opciones de fila/columna.') :
         (isCollaborating ? '' : 'Ambos, tú y la IA, pueden editar este documento.')
        }
         {!isCollaborating && (canUndo || canRedo) && " Usa Deshacer/Rehacer para navegar los cambios."}
         {isExcelFile && !isDocxFile && <span className="block mt-0.5">Nota Excel: Solo se edita la primera hoja. Formato y otras hojas no se conservan. La descarga será un nuevo archivo Excel simple.</span>}
         {isDocxFile && <span className="block mt-0.5 text-amber-700 bg-amber-50 p-1 rounded-md">Nota Word: Estás viendo una vista previa de texto. Imágenes, tablas y formato avanzado no se muestran. La descarga será en formato .txt.</span>}
      </p>
      {renderContextMenu()}
    </div>
  );
};
