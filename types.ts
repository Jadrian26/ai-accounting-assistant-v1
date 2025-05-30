
export interface Folder {
  id: string;
  name: string;
  parentId: string | null; // null for root folders
  deletedAt?: Date | null; // Timestamp if in trash, null otherwise
}

export interface AppFile {
  id:string;
  name: string;
  folderId: string | null; // null for files not in a folder (root files)
  content: string;
  createdAt: Date;
  deletedAt?: Date | null; // Timestamp if in trash, null otherwise
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  imagePreviewUrl?: string; // For displaying selected image in UI before/after sending
  imagePart?: { // For sending to Gemini API
    inlineData: {
      data: string; // base64 encoded string
      mimeType: string;
    };
  };
  isStreaming?: boolean; // For AI messages, true if currently "typing"
  fullText?: string; // For AI messages, the complete text to be streamed
}

export enum AISuggestionType {
  DOCUMENT_UPDATE = "document_update",
  CHAT_REPLY = "chat_reply",
}

export interface AIResponse {
  action_type: AISuggestionType;
  new_document_content?: string | null; // Ensure it can be null
  chat_message: string;
}

export type NotificationType = 'success' | 'error' | 'info';

export interface NotificationContent {
  type: NotificationType;
  message: string;
  title?: string;
}

export type MainSection = 'media'; // Currently only 'media' is supported
