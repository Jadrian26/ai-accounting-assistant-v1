// api-spec.ts
// This file defines the API contract between the frontend and backend.

// --- Re-exported core types (assuming they match the API contract directly) ---
// If the API uses slightly different structures, define new ApiFolder, ApiAppFile, etc.
export type { Folder, AppFile, ChatMessage, AISuggestionType, AIResponse } from './types';
import type { Folder as CoreFolder, AppFile as CoreAppFile, AISuggestionType, ChatMessage as CoreChatMessage } from './types';

// --- General API Structures ---

export interface ApiErrorResponse {
  errorCode: string; // e.g., "INVALID_INPUT", "UNAUTHORIZED", "NOT_FOUND", "SERVER_ERROR"
  message: string;
  details?: any;
}

export interface PaginatedResponse<T> {
  items: T[];
  totalItems: number;
  currentPage: number; // Typically 1-indexed
  totalPages: number;
  limit: number; // The limit used for this request
}

// Placeholder for Authentication - Assuming JWT tokens passed in Authorization header
// Example: Authorization: Bearer <token>

// --- API Endpoints ---

// 1. Folders
// --------------------------------------------------------------------------------

// POST /api/folders
export interface CreateFolderRequest {
  name: string;
  parentId: string | null;
}
// Returns the created folder, potentially with server-generated fields like id and timestamps.
export interface CreateFolderResponse extends CoreFolder {
  updatedAt?: Date; // Typically same as createdAt on creation
}

// GET /api/folders
// Query Parameters (examples):
//   parentId?: string (filters by parent folder ID, null for root)
//   deleted?: boolean (filters for items in trash, default false)
//   sortBy?: 'name' | 'createdAt' | 'updatedAt' (default 'name')
//   sortOrder?: 'asc' | 'desc' (default 'asc')
//   limit?: number (default 20)
//   offset?: number (default 0) or page?: number (default 1)
export type ListFoldersResponse = PaginatedResponse<CoreFolder>;

// PUT /api/folders/:id
export interface UpdateFolderRequest {
  name?: string;
  parentId?: string | null; // To move the folder
}
export interface UpdateFolderResponse extends CoreFolder {
  updatedAt?: Date;
}

// DELETE /api/folders/:id (Soft delete)
// No request body needed
// Response: 204 No Content, or 200 OK with the updated Folder (with deletedAt and updatedAt set)
export interface DeleteFolderResponse extends CoreFolder {
  deletedAt: Date; // Should be non-null after soft delete
  updatedAt?: Date;
}


// POST /api/folders/:id/restore
// No request body needed
export interface RestoreFolderResponse extends CoreFolder {
  deletedAt: null; // Should be null after restore
  updatedAt?: Date;
}

// DELETE /api/folders/:id/permanent
// No request body needed
// Response: 204 No Content


// 2. Files (Documents)
// --------------------------------------------------------------------------------

// POST /api/files
// For file uploads:
// - If content is pre-processed text (as done for .docx/.xlsx client-side parsing in current app), JSON request with 'content: string' is suitable.
// - For raw file uploads (e.g., images, or if backend handles parsing), this would typically be a multipart/form-data request.
//   The API would then need to handle file stream, parsing, and storage.
export interface CreateFileRequest {
  name: string;
  folderId: string | null;
  content?: string; // Initial content (e.g., pre-parsed text, or empty for new files).
  // For multipart/form-data, 'content' might be implicit or a file field.
}
// Returns the created file metadata, potentially with server-generated fields.
export interface CreateFileResponse extends CoreAppFile {
  updatedAt?: Date; // Typically same as createdAt on creation
}

// GET /api/files/:id
// Includes file content.
export interface GetFileResponse extends CoreAppFile {}

// GET /api/files
// Query Parameters (examples):
//   folderId?: string (filters by folder ID, null for root files)
//   deleted?: boolean (filters for items in trash, default false)
//   sortBy?: 'name' | 'createdAt' | 'updatedAt' (default 'name')
//   sortOrder?: 'asc' | 'desc' (default 'asc')
//   limit?: number (default 20)
//   offset?: number (default 0) or page?: number (default 1)
// Response usually contains metadata, not full content for all files to save bandwidth.
export type ListFilesResponse = PaginatedResponse<Omit<CoreAppFile, 'content'>>;

// PUT /api/files/:id
export interface UpdateFileRequest {
  name?: string;
  folderId?: string | null; // To move the file
  content?: string; // To update the document content
}
export interface UpdateFileResponse extends CoreAppFile {
  updatedAt?: Date;
}

// DELETE /api/files/:id (Soft delete)
// No request body needed
// Response: 204 No Content, or 200 OK with the updated AppFile (with deletedAt and updatedAt set)
export interface DeleteFileResponse extends CoreAppFile {
  deletedAt: Date; // Should be non-null after soft delete
  updatedAt?: Date;
}

// POST /api/files/:id/restore
// No request body needed
export interface RestoreFileResponse extends CoreAppFile {
  deletedAt: null; // Should be null after restore
  updatedAt?: Date;
}

// DELETE /api/files/:id/permanent
// No request body needed
// Response: 204 No Content

// POST /api/files/:id/duplicate
// No request body needed
export interface DuplicateFileResponse extends CoreAppFile {
  // The new file will have a new id and createdAt/updatedAt
  updatedAt?: Date;
}


// 3. AI Interaction (Chat)
// --------------------------------------------------------------------------------
// This endpoint would be called by the frontend to get AI assistance.
// The backend would then call the Gemini API.

// POST /api/ai/interaction
export interface AIInteractionRequest {
  userMessage: string;
  documentContent: string; // Current content of the document being edited
  imagePart?: { // Optional image data, aligned with ChatMessage['imagePart'] / Gemini structure
    inlineData: {
      data: string; // base64 encoded string
      mimeType: string; // e.g., "image/png", "image/jpeg"
    };
  };
  // Potentially include chatHistory if the AI needs more context, though current system instruction handles this.
}

// This matches the AIResponse type the frontend already expects from geminiService.ts
export interface AIInteractionResponse {
  action_type: AISuggestionType;
  new_document_content?: string | null;
  chat_message: string;
}

// Note on Chat Messages: Currently, chat messages are stored in client-side localStorage.
// If chat history needs to be persisted on the backend (e.g., per user, per document session),
// you would need additional endpoints:
//   POST /api/chat/messages - Request: { text: string, contextId?: string, imageId?: string } -> Response: ChatMessage
//   GET /api/chat/messages?contextId=xxx - Response: ChatMessage[]


// 4. Batch Operations
// --------------------------------------------------------------------------------
export type BatchItemType = 'file' | 'folder';
export interface BatchItem {
  id: string;
  type: BatchItemType;
}

// POST /api/batch/delete (Soft delete multiple items)
export interface BatchDeleteRequest {
  items: BatchItem[];
}
// Response: 200 OK with summary, e.g., { deletedFiles: number, deletedFolders: number, updatedItems: Array<CoreFolder | CoreAppFile> } or 204 No Content

// POST /api/batch/restore (Restore multiple items from trash)
export interface BatchRestoreRequest {
  items: BatchItem[];
}
// Response: 200 OK with summary, e.g., { restoredFiles: number, restoredFolders: number, updatedItems: Array<CoreFolder | CoreAppFile> } or 204 No Content

// POST /api/batch/delete-permanent (Permanently delete multiple items)
export interface BatchPermanentDeleteRequest {
  items: BatchItem[];
}
// Response: 200 OK with summary, e.g., { permanentlyDeletedFiles: number, permanentlyDeletedFolders: number } or 204 No Content

// POST /api/batch/move (Move multiple items to a new parent folder)
export interface BatchMoveRequest {
  items: BatchItem[];
  targetParentId: string | null; // null for root
}
// Response: 200 OK with summary, e.g., { movedFiles: number, movedFolders: number, updatedItems: Array<CoreFolder | CoreAppFile> } or 204 No Content


// --- HTTP Status Codes (Common examples) ---
// 200 OK - Request successful.
// 201 Created - Resource successfully created.
// 204 No Content - Request successful, no response body needed (e.g., for DELETE).
// 400 Bad Request - Invalid input (e.g., missing fields, validation errors). Response body: ApiErrorResponse.
// 401 Unauthorized - Authentication required or failed.
// 403 Forbidden - Authenticated user does not have permission.
// 404 Not Found - Requested resource does not exist.
// 500 Internal Server Error - Unexpected server error. Response body: ApiErrorResponse.