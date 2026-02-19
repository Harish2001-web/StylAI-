import { GoogleGenAI, Type } from "@google/genai";

export interface WardrobeItem {
  id: number;
  image_data: string;
  category: string;
  color: string;
  tags: string;
}

export const analyzeGarment = async (base64Image: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
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
  } catch (error) {
    console.error("Analysis Error:", error);
    throw error;
  }
};

export const getStylistAdvice = async (query: string, wardrobe: WardrobeItem[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const wardrobeContext = wardrobe.map(item => `- ${item.category} (${item.color}): ${item.tags}`).join('\n');
  
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: [
      {
        parts: [
          { text: `You are StyleSense, an expert AI fashion stylist. 
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
};

export const generateVirtualTryOn = async (userPhotoBase64: string, garmentBase64: string, prompt: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: userPhotoBase64.split(',')[1] || userPhotoBase64 } },
        { inlineData: { mimeType: "image/jpeg", data: garmentBase64.split(',')[1] || garmentBase64 } },
        { text: `Perform a virtual try-on. Overlay the garment from the second image onto the person in the first image. ${prompt}. Ensure realistic draping and fit.` }
      ]
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
};
