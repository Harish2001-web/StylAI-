export interface WardrobeItem {
  id: number;
  image_data: string;
  category: string;
  color: string;
  tags: string;
}

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}
