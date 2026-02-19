import { GoogleGenAI, Type } from "@google/genai";
import { WardrobeItem } from "../types";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getAIInstance = () => {
  // Use API_KEY if available (from selector), otherwise fallback to GEMINI_API_KEY
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  return new GoogleGenAI({ apiKey: apiKey! });
};

export const analyzeGarment = async (base64Image: string) => {
  const ai = getAIInstance();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: "Analyze this clothing item. Identify the category (e.g., top, bottom, shoes, accessory), primary color, and descriptive tags (e.g., denim, casual, formal, striped)." },
            { inlineData: { mimeType: "image/jpeg", data: base64Image.split(',')[1] || base64Image } }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            color: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["category", "color", "tags"]
        }
      }
    });

    if (!response.text) {
      throw new Error("No analysis received from AI");
    }

    return JSON.parse(response.text);
  } catch (error: any) {
    console.error("Analysis Error:", error);
    if (error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("Quota exceeded. Please connect a Pro API key in the header to continue.");
    }
    throw error;
  }
};

export const getStylistAdvice = async (query: string, wardrobe: WardrobeItem[]) => {
  const ai = getAIInstance();
  const wardrobeContext = wardrobe.map(item => `- ${item.category} (${item.color}): ${item.tags}`).join('\n');
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: `You are stylAi, an expert AI fashion stylist. 
            The user's current wardrobe consists of:
            ${wardrobeContext}
            
            User Query: "${query}"
            
            Suggest a complete outfit from their wardrobe or recommend what they should buy to "complete the look". 
            Provide a "Style Score" (1-100) and "Cost-Per-Wear" prediction.
            Be encouraging and fashion-forward.` }
          ]
        }
      ]
    });

    return response.text;
  } catch (error: any) {
    if (error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED")) {
      return "I've reached my free tier limit for now. Please connect a Pro API key in the header to continue our styling session!";
    }
    throw error;
  }
};

export const generateVirtualTryOn = async (userPhotoBase64: string, garmentBase64: string, prompt: string, retryCount = 0): Promise<string | null> => {
  const ai = getAIInstance();
  const MAX_RETRIES = 2;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: userPhotoBase64.split(',')[1] || userPhotoBase64 } },
          { inlineData: { mimeType: "image/jpeg", data: garmentBase64.split(',')[1] || garmentBase64 } },
          { text: `Perform a virtual try-on. Overlay the garment from the second image onto the person in the first image. ${prompt}. Ensure realistic draping and fit.` }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "3:4",
          imageSize: "1K"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error: any) {
    console.error(`Try-On Error (Attempt ${retryCount + 1}):`, error);
    
    const isQuotaError = error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED");
    
    if (isQuotaError && retryCount < MAX_RETRIES) {
      const waitTime = Math.pow(2, retryCount) * 2000; // 2s, 4s
      console.log(`Quota hit, retrying in ${waitTime}ms...`);
      await sleep(waitTime);
      return generateVirtualTryOn(userPhotoBase64, garmentBase64, prompt, retryCount + 1);
    }

    if (isQuotaError) {
      throw new Error("Quota exceeded for high-quality try-on. Please connect a Pro API key in the header for higher limits.");
    }
    throw error;
  }
};
