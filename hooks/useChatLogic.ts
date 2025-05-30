
import { useState, useEffect, useCallback } from 'react';
import { ChatMessage, AIResponse, AISuggestionType, AppFile, NotificationType } from '../types';
import { getAIResponse } from '../services/geminiService';
import { generateId, dateReviver } from '../utils/helpers';

const LS_CHAT_MESSAGES_KEY = 'aiLedgerApp_chatMessages_v1';

interface ChatLogicProps {
  showNotification: (type: NotificationType, message: string, title?: string) => void;
  updateDocumentContentWithHistory: (fileId: string, newContent: string) => void;
}

export const useChatLogic = ({ showNotification, updateDocumentContentWithHistory }: ChatLogicProps) => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    const savedMessages = localStorage.getItem(LS_CHAT_MESSAGES_KEY);
    return savedMessages ? JSON.parse(savedMessages, dateReviver).sort((a: ChatMessage, b: ChatMessage) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) : [];
  });
  const [isAILoading, setIsAILoading] = useState(false);
  const [isAICollaborating, setIsAICollaborating] = useState(false); // For visual feedback during AI doc update
  const [previousDocumentContentForUndo, setPreviousDocumentContentForUndo] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(LS_CHAT_MESSAGES_KEY, JSON.stringify(chatMessages));
  }, [chatMessages]);
  
  const addMessageToList = (message: ChatMessage) => {
    setChatMessages(prev => [...prev, message].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
  };

  const sendNewMessage = useCallback(async (
    messageText: string, 
    activeFile: AppFile | undefined | null,
    imagePart?: ChatMessage['imagePart'], 
    imagePreviewUrl?: string
  ) => {
    if (messageText.trim() === '' && !imagePart) {
      showNotification('info', "Por favor, escribe un mensaje o adjunta una imagen.", "Mensaje Vacío");
      return;
    }
    if (!activeFile && !imagePart && messageText.trim()) {
      showNotification('info', "Por favor, abre un documento o adjunta una imagen para chatear.", "Contexto Requerido");
      return;
    }

    const userMessage: ChatMessage = { 
        id: generateId(), 
        sender: 'user', 
        text: messageText, 
        timestamp: new Date(), 
        imagePart, 
        imagePreviewUrl 
    };
    addMessageToList(userMessage);
    setIsAILoading(true);
    setPreviousDocumentContentForUndo(null);

    try {
      const documentContext = activeFile ? activeFile.content : "";
      const aiResult: AIResponse = await getAIResponse(messageText, documentContext, imagePart);
      
      if (aiResult.action_type === AISuggestionType.DOCUMENT_UPDATE && aiResult.new_document_content !== null && activeFile) {
        setPreviousDocumentContentForUndo(activeFile.content);
        setIsAICollaborating(true); // For visual feedback in DocumentEditor
        updateDocumentContentWithHistory(activeFile.id, aiResult.new_document_content);
        setTimeout(() => setIsAICollaborating(false), 500); // Reset visual feedback
      } else if (aiResult.action_type === AISuggestionType.DOCUMENT_UPDATE && !activeFile) {
        addMessageToList({ 
          id: generateId(), 
          sender: 'ai', 
          text: aiResult.chat_message + " (Nota: No hay un documento activo para aplicar cambios.)", 
          timestamp: new Date() 
        });
        setIsAILoading(false);
        return;
      }
      
      addMessageToList({ 
        id: generateId(), 
        sender: 'ai', 
        text: aiResult.chat_message, 
        timestamp: new Date() 
      });

    } catch (error) {
      console.error("Error in AI interaction (sendNewMessage):", error);
      addMessageToList({ 
        id: generateId(), 
        sender: 'ai', 
        text: "Hubo un problema contactando a la IA.", 
        timestamp: new Date() 
      });
    } finally {
      setIsAILoading(false);
    }
  }, [showNotification, updateDocumentContentWithHistory]);


  const editAndRegenerateMessage = useCallback(async (
    originalUserMessageId: string,
    newText: string,
    activeFile: AppFile | undefined | null,
    originalUserMessageImagePart?: ChatMessage['imagePart'],
    originalUserMessageImagePreviewUrl?: string
  ) => {
    setIsAILoading(true);
    setPreviousDocumentContentForUndo(null);
  
    let oldAiMessageIdToRemove: string | null = null;
    let tempUpdatedMessages = [...chatMessages];
    const userMessageIndex = tempUpdatedMessages.findIndex(msg => msg.id === originalUserMessageId);
  
    if (userMessageIndex === -1) {
      console.error("Original user message not found for edit.");
      showNotification('error', "Mensaje original no encontrado para editar.", "Error de Edición");
      setIsAILoading(false);
      return;
    }
  
    // Update the user message
    tempUpdatedMessages[userMessageIndex] = {
      ...tempUpdatedMessages[userMessageIndex],
      text: newText,
      timestamp: new Date(), 
      imagePart: originalUserMessageImagePart, 
      imagePreviewUrl: originalUserMessageImagePreviewUrl,
    };
  
    if (userMessageIndex + 1 < tempUpdatedMessages.length && tempUpdatedMessages[userMessageIndex + 1].sender === 'ai') {
      oldAiMessageIdToRemove = tempUpdatedMessages[userMessageIndex + 1].id;
    }
  
    if (oldAiMessageIdToRemove) {
      tempUpdatedMessages = tempUpdatedMessages.filter(msg => msg.id !== oldAiMessageIdToRemove);
    }
    
    setChatMessages([...tempUpdatedMessages].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
  
    try {
      const documentContext = activeFile ? activeFile.content : "";
      const aiResult: AIResponse = await getAIResponse(newText, documentContext, originalUserMessageImagePart);
  
      const newAiResponseMessage: ChatMessage = {
        id: generateId(),
        sender: 'ai',
        text: aiResult.chat_message,
        timestamp: new Date()
      };
  
      if (aiResult.action_type === AISuggestionType.DOCUMENT_UPDATE && aiResult.new_document_content !== null && activeFile) {
        setPreviousDocumentContentForUndo(activeFile.content);
        setIsAICollaborating(true);
        updateDocumentContentWithHistory(activeFile.id, aiResult.new_document_content);
        setTimeout(() => setIsAICollaborating(false), 500);
      } else if (aiResult.action_type === AISuggestionType.DOCUMENT_UPDATE && !activeFile) {
        newAiResponseMessage.text += " (Nota: No hay un documento activo para aplicar cambios.)";
      }
      
      setChatMessages((prev: ChatMessage[]): ChatMessage[] => {
        const finalMessages = [...prev]; 
        const updatedUserMessageIdx = finalMessages.findIndex(m => m.id === originalUserMessageId);
        if (updatedUserMessageIdx !== -1) {
          finalMessages.splice(updatedUserMessageIdx + 1, 0, newAiResponseMessage);
        } else {
          finalMessages.push(newAiResponseMessage);
        }
        return finalMessages.sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      });
  
    } catch (error) {
      console.error("Error in AI interaction (edit/regenerate):", error);
      const errorResponseMessage: ChatMessage = {
        id: generateId(),
        sender: 'ai',
        text: "Hubo un problema contactando a la IA durante la regeneración.",
        timestamp: new Date()
      };
      setChatMessages((prev: ChatMessage[]): ChatMessage[] => {
          const finalMessages = [...prev];
          const updatedUserMessageIdx = finalMessages.findIndex(m => m.id === originalUserMessageId);
          if (updatedUserMessageIdx !== -1) {
            finalMessages.splice(updatedUserMessageIdx + 1, 0, errorResponseMessage);
          } else {
            finalMessages.push(errorResponseMessage);
          }
          return finalMessages.sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      });
    } finally {
      setIsAILoading(false);
    }
  }, [chatMessages, showNotification, updateDocumentContentWithHistory]);

  const deleteChatMessage = useCallback((messageId: string) => {
    setChatMessages(prev => prev.filter(msg => msg.id !== messageId).sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
    showNotification('info', 'Mensaje eliminado.');
  }, [showNotification]);

  const undoAIDocumentChange = useCallback((activeFile: AppFile | undefined | null) => {
    if (activeFile && previousDocumentContentForUndo !== null) {
      updateDocumentContentWithHistory(activeFile.id, previousDocumentContentForUndo);
      setPreviousDocumentContentForUndo(null);
      showNotification('info', "El último cambio de la IA ha sido deshecho.");
    }
  }, [previousDocumentContentForUndo, updateDocumentContentWithHistory, showNotification]);

  const addWelcomeMessage = useCallback((fileName: string, isNewFile: boolean) => {
    const welcomeText = isNewFile 
      ? `Has creado y abierto "${fileName}". ¿En qué puedo ayudarte?`
      : `Has abierto "${fileName}". ¿En qué puedo ayudarte?`;
    
    setChatMessages((prevMessages) => {
      // Remove previous "Has abierto..." style messages to keep chat clean
      const filteredMessages = prevMessages.filter(m => !(m.sender === 'ai' && (m.text.startsWith("Has abierto") || m.text.startsWith("Has creado y abierto")) ));
      const newMessage: ChatMessage = {
        id: generateId(),
        sender: 'ai',
        text: welcomeText,
        timestamp: new Date()
      };
      return [...filteredMessages, newMessage].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    });
  }, []);


  return {
    chatMessages,
    isAILoading,
    isAICollaborating,
    previousDocumentContentForUndo, // For DocumentEditor to consume
    sendNewMessage,
    editAndRegenerateMessage,
    deleteChatMessage,
    undoAIDocumentChange,
    addWelcomeMessage,
    setPreviousDocumentContentForUndo, // Allow App.tsx to clear this if needed (e.g. on file close)
  };
};
