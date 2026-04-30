import { GoogleGenAI } from '@google/genai';

// Initialize the Gemini client
// Note: In a real app, you'd want to handle the API key securely.
// Since the user mentioned they'll add the API key in .env, we'll try to read it from import.meta.env
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

export interface ChangeAnalysis {
  type: 'Addition' | 'Deletion' | 'Modification' | 'Formatting';
  confidenceScore: number;
  explanation: string;
  isRisky: boolean;
}

export const analyzeChange = async (originalText: string, newText: string, context: string): Promise<ChangeAnalysis> => {
  if (!apiKey) {
    return {
      type: 'Modification',
      confidenceScore: 0,
      explanation: 'API Key not configured. Please add VITE_GEMINI_API_KEY to your .env file.',
      isRisky: false
    };
  }

  try {
    const prompt = `
      You are an expert document analyst for a pharmaceutical or legal company.
      Analyze the difference between the original text and the new text.
      
      Original Text: "${originalText}"
      New Text: "${newText}"
      Context: "${context}"

      Provide your analysis in JSON format with the following fields:
      - "type": (Addition, Deletion, Modification, Formatting)
      - "confidenceScore": (number from 0 to 100)
      - "explanation": (A clear, context-aware explanation of why this change was likely made and its impact)
      - "isRisky": (boolean, true if this change could alter the meaning or legality of the document)
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.0-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as ChangeAnalysis;
    }
    
    throw new Error('No response from AI');
  } catch (error) {
    console.error('Error analyzing change:', error);
    return {
      type: 'Modification',
      confidenceScore: 0,
      explanation: 'Failed to analyze change due to an error.',
      isRisky: true
    };
  }
};

export const generateDocumentSummary = async (originalContent: string, newContent: string): Promise<string> => {
  if (!apiKey) {
    return 'API Key not configured. Please add VITE_GEMINI_API_KEY to your .env file.';
  }

  try {
    const prompt = `
      You are an expert document analyst. Provide an executive summary of the changes between the original document and the new document.
      Focus on the most important semantic changes and potential risks.
      
      Original:
      ${originalContent.substring(0, 2000)}...

      New:
      ${newContent.substring(0, 2000)}...
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.0-flash',
      contents: prompt,
    });

    return response.text || 'No summary generated.';
  } catch (error) {
    console.error('Error generating summary:', error);
    return 'Failed to generate summary due to an error.';
  }
};
