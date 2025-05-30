
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, NotificationType } from '../types';
import { Button } from './Button';
import { SparklesIcon, PaperClipIcon, UploadIcon, XMarkIcon, PaperAirplaneIcon, EllipsisHorizontalIcon, PencilIcon, TrashIcon } from './icons'; 

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendNewMessage: (messageText: string, imagePart?: ChatMessage['imagePart'], imagePreviewUrl?: string) => void;
  onEditAndRegenerateMessage: (originalMessageId: string, newText: string, imagePart?: ChatMessage['imagePart'], imagePreviewUrl?: string) => void;
  onDeleteMessage: (messageId: string) => void;
  isLoading: boolean; 
  activeDocumentName: string | null;
  style?: React.CSSProperties; 
  showNotification: (type: NotificationType, message: string, title?: string) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ 
  messages, 
  onSendNewMessage,
  onEditAndRegenerateMessage,
  onDeleteMessage,
  isLoading, 
  activeDocumentName, 
  style, 
  showNotification 
}) => {
  const [inputText, setInputText] = useState('');
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatInputAreaRef = useRef<HTMLDivElement>(null);
  const [isDraggingOverChatInput, setIsDraggingOverChatInput] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [activeOptionsMessageId, setActiveOptionsMessageId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null); 
  const optionsMenuRef = useRef<HTMLDivElement>(null);


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages, isLoading, editingMessage]);


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node)) {
        setActiveOptionsMessageId(null);
      }
    };
    if (activeOptionsMessageId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeOptionsMessageId]);


  const processImageFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
        setSelectedImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
    } else {
        showNotification('error', `El archivo "${file.name}" no es una imagen admitida. Solo se pueden adjuntar imágenes.`, "Tipo de Archivo No Soportado");
    }
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      processImageFile(event.target.files[0]);
    }
  };

  const removeSelectedImage = () => {
    setSelectedImageFile(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; 
    }
  };

  const handleSendOrSubmitEdit = async () => {
    if (editingMessage) { 
      if (inputText.trim() === '') {
        showNotification('error', 'El mensaje no puede estar vacío para reenviar y regenerar.', 'Error de Reenvío');
        return;
      }
      // Call onEditAndRegenerateMessage with the edited text and original image parts if any
      onEditAndRegenerateMessage(editingMessage.id, inputText.trim(), editingMessage.imagePart, editingMessage.imagePreviewUrl); 
      setEditingMessage(null);
      setInputText('');
      // selectedImageFile and imagePreviewUrl are not used/cleared here as they are hidden during edit mode.
      textareaRef.current?.focus();
      return;
    }

    // Send new message
    if (inputText.trim() === '' && !selectedImageFile) {
        showNotification('info', "Por favor, escribe un mensaje o adjunta una imagen.", "Mensaje Vacío");
        return;
    }

    let imagePartToSend: ChatMessage['imagePart'] | undefined = undefined;
    let previewUrlForMessage: string | undefined = imagePreviewUrl || undefined;

    if (selectedImageFile) {
      const reader = new FileReader();
      reader.readAsDataURL(selectedImageFile);
      try {
        await new Promise<void>((resolve, reject) => {
          reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            imagePartToSend = {
              inlineData: {
                data: base64String,
                mimeType: selectedImageFile.type,
              },
            };
            resolve();
          };
          reader.onerror = (error) => {
              console.error("Error reading image file for sending:", error);
              showNotification('error', "No se pudo leer el archivo de imagen seleccionado. Por favor, intenta con otra imagen o verifica el archivo.", "Error de Lectura de Imagen");
              reject(error);
          };
        });
      } catch (error) {
        return;
      }
    }
    
    onSendNewMessage(inputText.trim(), imagePartToSend, previewUrlForMessage);
    setInputText('');
    removeSelectedImage();
    textareaRef.current?.focus();
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setInputText('');
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendOrSubmitEdit();
    }
  };
  
  useEffect(() => {
    if (textareaRef.current) {
      const currentScrollHeight = textareaRef.current.scrollHeight;
      if (currentScrollHeight > 40 && currentScrollHeight <= 128 ) { 
         textareaRef.current.style.height = 'auto'; 
         textareaRef.current.style.height = `${currentScrollHeight}px`;
      } else if (currentScrollHeight <= 40) {
         textareaRef.current.style.height = '2.5rem'; // h-10
      }
    }
  }, [inputText]);


  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.items && event.dataTransfer.items.length > 0) {
        const containsImage = Array.from(event.dataTransfer.items).some(item => item.kind === 'file' && item.type.startsWith('image/'));
        if (containsImage) {
            setIsDraggingOverChatInput(true);
        }
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDraggingOverChatInput) {
        const containsImage = Array.from(event.dataTransfer.items).some(item => item.kind === 'file' && item.type.startsWith('image/'));
        if (containsImage) {
            setIsDraggingOverChatInput(true);
        }
    }
  }, [isDraggingOverChatInput]);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (chatInputAreaRef.current && !chatInputAreaRef.current.contains(event.relatedTarget as Node)) {
      setIsDraggingOverChatInput(false);
    }
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOverChatInput(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0]; 
      processImageFile(file);
      if (event.dataTransfer.items) {
        event.dataTransfer.items.clear();
      } else {
        event.dataTransfer.clearData();
      }
    }
  }, [processImageFile, showNotification]);


  const handleMessageOptionsClick = (messageId: string) => {
    setActiveOptionsMessageId(prev => (prev === messageId ? null : messageId));
  };

  const handleEditAction = (message: ChatMessage) => { 
    setEditingMessage(message);
    setInputText(message.text); // Populate input with original text to edit
    setActiveOptionsMessageId(null);
    textareaRef.current?.focus();
  };

  const handleDeleteAction = (messageId: string) => {
    onDeleteMessage(messageId);
    setActiveOptionsMessageId(null);
  };


  return (
    <div 
      className="bg-slate-100 border-l border-slate-300 flex flex-col h-full shadow-lg" 
      style={{ ...style, flexShrink: 0 }} 
    >
      <div className="p-4 border-b border-slate-200 bg-white">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center">
          <SparklesIcon className="w-6 h-6 mr-2.5 text-sky-500" />
          Asistente IA
        </h2>
        {activeDocumentName && <p className="text-xs text-slate-500 mt-1.5 ml-1">Colaborando en: <span className="font-medium text-slate-700">{activeDocumentName}</span></p>}
        {!activeDocumentName && <p className="text-xs text-slate-500 mt-1.5 ml-1">Abre un documento o adjunta una imagen para chatear.</p>}
      </div>

      <div className="flex-grow p-4 space-y-1 overflow-y-auto bg-slate-100 scroll-smooth">
        {messages.map(msg => (
          <div key={msg.id} className={`group flex items-start ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} relative`}>
             {/* Options button for AI messages */}
            {msg.sender === 'ai' && (
              <button
                onClick={() => handleMessageOptionsClick(msg.id)}
                className="p-1 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150 mr-1 flex-shrink-0"
                aria-label="Opciones del mensaje"
              >
                <EllipsisHorizontalIcon className="w-5 h-5" />
              </button>
            )}
            <div
              className={`max-w-sm md:max-w-md lg:max-w-lg px-4 py-2.5 shadow-md relative ${
                msg.sender === 'user' 
                ? 'bg-sky-500 text-white rounded-t-xl rounded-bl-xl' 
                : 'bg-white text-slate-800 rounded-t-xl rounded-br-xl border border-slate-200' 
              }`}
            >
              {msg.imagePreviewUrl && (
                <img src={msg.imagePreviewUrl} alt="Adjunto" className="max-w-full h-auto rounded-lg mb-2 max-h-60 object-contain border border-slate-300 bg-slate-50" />
              )}
              <p className="text-sm whitespace-pre-wrap break-words">
                {msg.text}
              </p>
              <p className={`text-xs mt-2 opacity-80 text-right ${msg.sender === 'user' ? 'text-sky-100' : 'text-slate-500'}`}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            {/* Options button for user messages */}
            {msg.sender === 'user' && (
              <button
                onClick={() => handleMessageOptionsClick(msg.id)}
                className="p-1 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150 ml-1 flex-shrink-0"
                aria-label="Opciones del mensaje"
              >
                <EllipsisHorizontalIcon className="w-5 h-5" />
              </button>
            )}

            {/* Options Menu */}
            {activeOptionsMessageId === msg.id && (
              <div
                ref={optionsMenuRef}
                className={`absolute z-20 w-48 bg-white rounded-md shadow-xl border border-slate-200 py-1
                            ${msg.sender === 'user' ? 'right-8 top-0' : 'left-8 top-0'} `}
                onClick={(e) => e.stopPropagation()}
              >
                {msg.sender === 'user' && (
                  <button
                    onClick={() => handleEditAction(msg)}
                    className="flex items-center w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <PencilIcon className="w-4 h-4 mr-2.5 text-slate-500" /> Editar y Regenerar
                  </button>
                )}
                <button
                  onClick={() => handleDeleteAction(msg.id)}
                  className="flex items-center w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <TrashIcon className="w-4 h-4 mr-2.5" /> Eliminar
                </button>
              </div>
            )}
          </div>
        ))}
        {isLoading && ( 
          !messages.some(m => m.sender === 'ai' && m.isStreaming) && 
          <div className="flex justify-start">
            <div className="max-w-xs lg:max-w-md px-4 py-3 rounded-xl shadow-md bg-white text-slate-800 border border-slate-200">
              <div className="flex items-center space-x-2.5">
                <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse delay-75"></div>
                <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse delay-150"></div>
                <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse delay-300"></div>
                <span className="text-sm text-slate-600">AI está pensando...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div 
        ref={chatInputAreaRef}
        className="p-3 border-t border-slate-200 bg-white relative"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDraggingOverChatInput && (
          <div className="absolute inset-0 bg-sky-100 bg-opacity-80 border-2 border-dashed border-sky-400 rounded-lg flex flex-col items-center justify-center z-10 pointer-events-none m-2">
            <UploadIcon className="w-10 h-10 text-sky-500 mb-2 animate-bounce" />
            <p className="text-sm font-medium text-sky-600">Suelta la imagen aquí</p>
          </div>
        )}
        {imagePreviewUrl && !editingMessage && (
          <div className="mb-2 p-1.5 border border-slate-300 rounded-lg bg-slate-50 relative w-fit shadow-sm">
            <img src={imagePreviewUrl} alt="Preview" className="max-h-24 w-auto rounded-md" />
            <button 
              onClick={removeSelectedImage} 
              className="absolute -top-2.5 -right-2.5 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 transition-colors shadow-md focus:outline-none focus:ring-2 focus:ring-red-400"
              aria-label="Eliminar imagen seleccionada"
            >
              <XMarkIcon className="w-3.5 h-3.5"/>
            </button>
          </div>
        )}
        {editingMessage && (
          <div className="mb-2 p-2 border-b border-slate-200 text-sm text-slate-600 bg-sky-50 rounded-t-md">
            Editando mensaje para regenerar respuesta: <span className="italic">"{editingMessage.text.substring(0,30)}{editingMessage.text.length > 30 ? '...' : ''}"</span>
          </div>
        )}
        <div className="flex items-end space-x-2"> 
          {!editingMessage && (
            <Button
              variant="secondary"
              className="!rounded-full w-10 h-10 p-2 flex items-center justify-center text-slate-600 hover:text-slate-700 flex-shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || messages.some(m => m.isStreaming)}
              aria-label="Adjuntar imagen"
              title="Adjuntar imagen"
            >
              <PaperClipIcon className="w-5 h-5" />
            </Button>
          )}
          
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            onChange={handleImageChange} 
            className="hidden" 
            disabled={isLoading || messages.some(m => m.isStreaming) || !!editingMessage}
          />

          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={editingMessage ? "Modifica el texto para regenerar..." : "Pregunta lo que quieras"}
            aria-label={editingMessage ? "Modifica el texto para regenerar" : "Pregunta lo que quieras"}
            rows={1}
            className="flex-grow p-2.5 border border-slate-300 rounded-xl resize-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition-all placeholder-slate-400 text-sm bg-slate-100 text-slate-800 max-h-32 overflow-y-auto h-10"
            disabled={isLoading || messages.some(m => m.isStreaming)}
          />
          
          {editingMessage ? (
            <div className="flex space-x-2">
              <Button 
                onClick={handleCancelEdit} 
                variant="secondary"
                size="sm"
                className="text-slate-700"
                aria-label="Cancelar edición y regeneración"
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleSendOrSubmitEdit} 
                disabled={isLoading || !inputText.trim()} 
                variant="primary"
                size="sm"
                aria-label="Enviar mensaje modificado para regenerar respuesta"
              >
                Enviar
              </Button>
            </div>
          ) : (
            <Button 
              onClick={handleSendOrSubmitEdit} 
              disabled={isLoading || (!inputText.trim() && !selectedImageFile) || messages.some(m => m.isStreaming)} 
              variant="secondary"
              className="!rounded-full w-10 h-10 p-2 flex items-center justify-center text-sky-600 hover:bg-slate-200 flex-shrink-0"
              aria-label="Enviar mensaje"
              title="Enviar mensaje"
            >
              <PaperAirplaneIcon className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
