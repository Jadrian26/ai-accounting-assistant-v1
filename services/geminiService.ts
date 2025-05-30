
import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";
import { AIResponse, AISuggestionType, ChatMessage } from '../types'; // Added ChatMessage for imagePart
import { GEMINI_MODEL_TEXT, AI_SYSTEM_INSTRUCTION } from '../constants';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("API_KEY environment variable not set. AI features will not work.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY || "MISSING_API_KEY" });

export const getAIResponse = async (
  userMessage: string,
  documentContent: string,
  imagePart?: ChatMessage['imagePart'] // Optional image part
): Promise<AIResponse> => {
  if (!API_KEY) {
    return {
      action_type: AISuggestionType.CHAT_REPLY,
      new_document_content: null, // Ensure consistent structure
      chat_message: "AI features are disabled because the API key is not configured.",
    };
  }
  
  const promptWithContext = `User message: "${userMessage}"\n\nCurrent document content:\n---\n${documentContent}\n---`;

  const contentParts: Part[] = [{ text: promptWithContext }];

  if (imagePart) {
    contentParts.unshift(imagePart); // Add image part at the beginning if it exists
  }

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: [{ role: "user", parts: contentParts }],
      config: {
        systemInstruction: AI_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
      },
    });

    let jsonStr = response.text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }
    
    const parsedResponse = JSON.parse(jsonStr) as AIResponse; // This is where "Bad control character" error occurs if AI doesn't escape properly
    
    // Enhanced validation
    if (typeof parsedResponse !== 'object' || parsedResponse === null ||
        !parsedResponse.action_type || 
        typeof parsedResponse.chat_message !== 'string' ||
        !Object.values(AISuggestionType).includes(parsedResponse.action_type) ||
        parsedResponse.new_document_content === undefined // Must be present (string or null)
    ) {
        console.error("Invalid AI response structure or missing/invalid critical fields:", parsedResponse);
        return {
            action_type: AISuggestionType.CHAT_REPLY,
            new_document_content: null,
            chat_message: "Sorry, I received an unexpected response structure from the AI. Please try again.",
        };
    }

    if (parsedResponse.action_type === AISuggestionType.DOCUMENT_UPDATE) {
        if (typeof parsedResponse.new_document_content !== 'string') {
            console.error("AI suggested document update but 'new_document_content' is not a string:", parsedResponse);
            return {
                action_type: AISuggestionType.CHAT_REPLY,
                new_document_content: null,
                chat_message: "Sorry, I tried to update the document but received invalid content data. Please try again.",
            };
        }
    } else if (parsedResponse.action_type === AISuggestionType.CHAT_REPLY) {
        if (parsedResponse.new_document_content !== null) {
            console.warn("AI suggested chat reply but 'new_document_content' was not null. Correcting.", parsedResponse);
            // Non-critical, but log and ensure consistency for the app.
            // The AI should ideally follow the instruction to set it to null.
            // We can enforce it here for the app's internal consistency if needed,
            // but the primary fix is the AI instruction.
            // For now, let the app receive it as is if the model made a mistake,
            // but the instruction aims to prevent this. If it becomes an issue,
            // we could do: parsedResponse.new_document_content = null;
        }
    }

    return parsedResponse;

  } catch (error) {
    console.error("Error calling Gemini API or parsing response:", error);
    let errorMessage = "Sorry, I encountered an error. Please try again.";
    if (error instanceof Error) {
        // Check if it's a JSON parsing error specifically, which the new instruction aims to prevent
        if (error.message.includes("JSON at position") || error.name === "SyntaxError") {
             errorMessage = `Sorry, there was an issue understanding the AI's response format (JSON). Please try again. Details: ${error.message}`;
        } else {
            errorMessage = `Sorry, I encountered an error: ${error.message}. Please try again.`;
        }
    }
    return {
      action_type: AISuggestionType.CHAT_REPLY,
      new_document_content: null,
      chat_message: errorMessage,
    };
  }
};