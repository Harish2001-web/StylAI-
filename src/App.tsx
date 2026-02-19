import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  Plus, 
  Shirt, 
  Sparkles, 
  Trash2, 
  ChevronRight, 
  MessageSquare, 
  User, 
  ShoppingBag,
  Loader2,
  Image as ImageIcon,
  CheckCircle2,
  Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeGarment, getStylistAdvice, generateVirtualTryOn } from './services/geminiService';
import { WardrobeItem } from './types';

// --- Components ---

const Navbar = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) => (
  <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl px-8 py-4 flex items-center gap-10 z-50 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
    <button 
      onClick={() => setActiveTab('closet')}
      className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${activeTab === 'closet' ? 'text-brand-primary scale-110' : 'text-white/40 hover:text-white'}`}
    >
      <Shirt size={22} />
      <span className="text-[9px] uppercase tracking-[0.2em] font-bold">Closet</span>
    </button>
    <button 
      onClick={() => setActiveTab('stylist')}
      className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${activeTab === 'stylist' ? 'text-brand-primary scale-110' : 'text-white/40 hover:text-white'}`}
    >
      <Sparkles size={22} />
      <span className="text-[9px] uppercase tracking-[0.2em] font-bold">Stylist</span>
    </button>
    <button 
      onClick={() => setActiveTab('tryon')}
      className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${activeTab === 'tryon' ? 'text-brand-primary scale-110' : 'text-white/40 hover:text-white'}`}
    >
      <User size={22} />
      <span className="text-[9px] uppercase tracking-[0.2em] font-bold">Try-On</span>
    </button>
  </nav>
);

const WardrobeCard = ({ item, onDelete }: { item: WardrobeItem, onDelete: (id: number) => void | Promise<void>, key?: any }) => (
  <motion.div 
    layout
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.9 }}
    className="group relative aspect-[3/4] bg-zinc-900/50 rounded-[2rem] overflow-hidden border border-white/5 hover:border-brand-primary/30 transition-all duration-500"
  >
    <img src={item.image_data} alt={item.category} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-6">
      <div className="translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
        <p className="text-white font-serif italic text-lg capitalize">{item.category}</p>
        <p className="text-white/50 text-xs mt-1 tracking-wider uppercase">{item.color} • {item.tags}</p>
      </div>
      <button 
        onClick={() => onDelete(item.id)}
        className="absolute top-4 right-4 p-2.5 bg-red-500/10 hover:bg-red-500/30 text-red-400 rounded-full transition-all duration-300 backdrop-blur-md"
      >
        <Trash2 size={14} />
      </button>
    </div>
  </motion.div>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState('closet');
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [stylistChat, setStylistChat] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [query, setQuery] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  
  // Try-on state
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<WardrobeItem[]>([]);
  const [tryOnResult, setTryOnResult] = useState<string | null>(null);
  const [tryOnProgress, setTryOnProgress] = useState<{ current: number, total: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        console.log("Server Health:", data);
      } catch (err) {
        console.error("Server Health Check Failed:", err);
      }
    };
    checkHealth();
    fetchWardrobe();
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    if (window.aistudio?.hasSelectedApiKey) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setHasApiKey(hasKey);
    }
  };

  const handleOpenKeySelector = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const fetchWardrobe = async () => {
    const res = await fetch('/api/wardrobe');
    const data = await res.json();
    setWardrobe(data);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const originalBase64 = reader.result as string;
      
      // Resize image to reduce payload size
      const img = new Image();
      img.src = originalBase64;
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', 0.8);

        try {
          const analysis = await analyzeGarment(base64);
          if (!analysis || typeof analysis !== 'object') throw new Error("Invalid analysis result");
          
          const res = await fetch('/api/wardrobe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image_data: base64,
              category: analysis.category || "Unknown",
              color: analysis.color || "Unknown",
              tags: Array.isArray(analysis.tags) ? analysis.tags.join(', ') : (analysis.tags || "")
            })
          });

          if (!res.ok) {
            const errorText = await res.text().catch(() => "No response body");
            let errorMsg = "Failed to save to database";
            try {
              const errorData = JSON.parse(errorText);
              errorMsg = errorData.error || errorMsg;
            } catch (e) {
              errorMsg = `Server Error (${res.status}): ${errorText.substring(0, 100)}`;
            }
            throw new Error(errorMsg);
          }
          fetchWardrobe();
        } catch (err: any) {
          console.error(err);
          alert(`Failed to add garment: ${err.message || "Unknown error"}`);
        } finally {
          setLoading(false);
        }
      };
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/wardrobe/${id}`, { method: 'DELETE' });
    fetchWardrobe();
  };

  const handleStylistQuery = async () => {
    if (!query.trim()) return;
    const userMsg = query;
    setQuery('');
    setStylistChat(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const response = await getStylistAdvice(userMsg, wardrobe);
      setStylistChat(prev => [...prev, { role: 'ai', text: response }]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTryOn = async () => {
    if (!userPhoto || selectedItems.length === 0) return;
    
    // Warn user if they are doing multi-layer without a Pro key
    if (selectedItems.length > 1 && !hasApiKey) {
      const proceed = confirm("Multi-layer try-on is resource-intensive and may hit free tier limits. For the best experience, please connect a Pro API key in the header. Proceed anyway?");
      if (!proceed) return;
    }

    setLoading(true);
    setTryOnProgress({ current: 0, total: selectedItems.length });
    
    try {
      let currentBaseImage = userPhoto;
      
      for (let i = 0; i < selectedItems.length; i++) {
        setTryOnProgress({ current: i + 1, total: selectedItems.length });
        const item = selectedItems[i];
        
        // Add a small delay between layers to avoid hitting rate limits on free tier
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 1500));

        const result = await generateVirtualTryOn(
          currentBaseImage, 
          item.image_data, 
          `Layering ${item.category} (${item.color}) onto the person. Step ${i + 1} of ${selectedItems.length}.`
        );
        
        if (result) {
          currentBaseImage = result;
          setTryOnResult(result);
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Try-on failed");
    } finally {
      setLoading(false);
      setTryOnProgress(null);
    }
  };

  const toggleItemSelection = (item: WardrobeItem) => {
    setSelectedItems(prev => {
      const isSelected = prev.find(i => i.id === item.id);
      if (isSelected) {
        return prev.filter(i => i.id !== item.id);
      } else {
        return [...prev, item];
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white font-sans selection:bg-brand-primary/30 overflow-x-hidden">
      {/* Decorative Background Elements */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-primary/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-secondary/5 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="p-8 flex justify-between items-center border-b border-white/5 bg-black/20 backdrop-blur-xl sticky top-0 z-40">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="w-10 h-10 bg-gradient-to-br from-brand-primary via-brand-primary to-brand-secondary rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.3)] group-hover:rotate-[10deg] transition-transform duration-500">
            <Crown size={20} className="text-white fill-current" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tighter font-serif italic">stylAi</h1>
            <p className="text-[8px] uppercase tracking-[0.3em] text-white/40 font-bold -mt-1">Couture Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <button 
            onClick={handleOpenKeySelector}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-300 ${hasApiKey ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400' : 'border-brand-primary/30 bg-brand-primary/5 text-brand-primary hover:bg-brand-primary/10'}`}
          >
            <div className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-emerald-500 animate-pulse' : 'bg-brand-primary animate-pulse'}`} />
            <span className="text-[10px] uppercase tracking-widest font-bold">
              {hasApiKey ? 'Pro Active' : 'Connect Pro Key'}
            </span>
          </button>
          <button className="p-2 text-white/40 hover:text-brand-primary transition-all duration-300">
            <ShoppingBag size={22} />
          </button>
          <div className="w-10 h-10 rounded-full p-[1px] bg-gradient-to-tr from-brand-primary to-brand-secondary">
            <div className="w-full h-full rounded-full bg-zinc-900 overflow-hidden border-2 border-black">
              <img src="https://picsum.photos/seed/fashion/100/100" alt="Avatar" referrerPolicy="no-referrer" />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-8 pb-40 relative z-10">
        <AnimatePresence mode="wait">
          {activeTab === 'closet' && (
            <motion.div 
              key="closet"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h2 className="text-5xl font-bold tracking-tight font-serif italic">The Archive</h2>
                  <p className="text-white/40 mt-2 text-sm tracking-widest uppercase font-medium">Your curated digital collection</p>
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="group relative px-8 py-4 bg-white text-black rounded-full font-bold overflow-hidden transition-all duration-500 hover:pr-12 active:scale-95 disabled:opacity-50"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {loading ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                    Digitize Garment
                  </span>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-500">
                    <ChevronRight size={18} />
                  </div>
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleUpload} 
                  className="hidden" 
                  accept="image/*" 
                />
              </div>

              {wardrobe.length === 0 ? (
                <div className="aspect-[21/9] border border-white/5 bg-white/[0.02] rounded-[3rem] flex flex-col items-center justify-center text-white/20 gap-6 backdrop-blur-sm">
                  <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                    <Shirt size={40} strokeWidth={1} />
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-serif italic text-white/40">Your archive is currently empty</p>
                    <p className="text-xs uppercase tracking-widest mt-2">Begin your digital journey by adding a piece</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                  {wardrobe.map(item => (
                    <WardrobeCard key={item.id} item={item} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'stylist' && (
            <motion.div 
              key="stylist"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="h-[calc(100vh-240px)] flex flex-col max-w-4xl mx-auto"
            >
              <div className="flex-1 overflow-y-auto space-y-8 pr-4 custom-scrollbar scroll-smooth">
                {stylistChat.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-8">
                    <div className="relative">
                      <div className="w-24 h-24 bg-brand-primary/10 rounded-full flex items-center justify-center text-brand-primary animate-pulse">
                        <Sparkles size={48} />
                      </div>
                      <div className="absolute -top-2 -right-2 w-8 h-8 bg-brand-secondary rounded-full flex items-center justify-center text-black">
                        <Crown size={16} className="fill-current" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-4xl font-bold font-serif italic">Personal Stylist</h3>
                      <p className="text-white/40 mt-3 text-sm tracking-widest uppercase font-medium">Agentic reasoning for your aesthetic</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                      {[
                        "Suggest a casual weekend look", 
                        "What goes with my blue denim?", 
                        "Outfit for a tech interview",
                        "Style a look for a beach wedding"
                      ].map(suggestion => (
                        <button 
                          key={suggestion}
                          onClick={() => setQuery(suggestion)}
                          className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl text-sm text-white/60 hover:bg-white/[0.08] hover:border-brand-primary/30 transition-all duration-300 text-left group flex justify-between items-center"
                        >
                          {suggestion}
                          <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {stylistChat.map((msg, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={i} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] p-6 rounded-[2rem] shadow-xl ${msg.role === 'user' ? 'bg-brand-primary text-white font-medium rounded-tr-none' : 'bg-zinc-900/80 border border-white/10 text-white/90 backdrop-blur-md rounded-tl-none'}`}>
                      {msg.text.split('\n').map((line, j) => (
                        <p key={j} className={j > 0 ? 'mt-3' : ''}>{line}</p>
                      ))}
                    </div>
                  </motion.div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-zinc-900/50 border border-white/5 p-5 rounded-[2rem] rounded-tl-none flex items-center gap-4 backdrop-blur-md">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-brand-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1.5 h-1.5 bg-brand-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 bg-brand-primary rounded-full animate-bounce" />
                      </div>
                      <span className="text-xs text-white/40 uppercase tracking-[0.2em] font-bold">Consulting the oracle...</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-8 relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-brand-primary to-brand-secondary rounded-[2.5rem] blur opacity-20 group-hover:opacity-40 transition duration-1000 group-focus-within:opacity-50" />
                <input 
                  type="text" 
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStylistQuery()}
                  placeholder="Describe your occasion or ask for a remix..."
                  className="relative w-full bg-[#0F0F15] border border-white/10 rounded-[2rem] px-8 py-5 focus:outline-none focus:border-brand-primary/50 transition-all duration-500 pr-20 text-lg placeholder:text-white/20"
                />
                <button 
                  onClick={handleStylistQuery}
                  disabled={loading || !query.trim()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-14 h-14 bg-brand-primary text-white rounded-full flex items-center justify-center hover:bg-violet-500 transition-all duration-300 disabled:opacity-50 shadow-lg shadow-brand-primary/20 active:scale-90"
                >
                  <ChevronRight size={24} />
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'tryon' && (
            <motion.div 
              key="tryon"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start"
            >
              <div className="lg:col-span-5 space-y-10">
                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold font-serif italic flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-primary/20 flex items-center justify-center text-brand-primary">
                        <User size={16} />
                      </div>
                      The Canvas
                    </h3>
                    <span className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Step 01</span>
                  </div>
                  <div 
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e: any) => {
                        const file = e.target.files[0];
                        const reader = new FileReader();
                        reader.onloadend = () => setUserPhoto(reader.result as string);
                        reader.readAsDataURL(file);
                      };
                      input.click();
                    }}
                    className="aspect-[3/4] bg-zinc-900/50 rounded-[3rem] border-2 border-dashed border-white/5 flex flex-col items-center justify-center cursor-pointer hover:border-brand-primary/40 transition-all duration-500 overflow-hidden relative group shadow-2xl"
                  >
                    {userPhoto ? (
                      <>
                        <img src={userPhoto} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all duration-500 backdrop-blur-sm">
                          <Camera size={40} className="mb-2" />
                          <p className="text-xs uppercase tracking-widest font-bold">Replace Photo</p>
                        </div>
                      </>
                    ) : (
                      <div className="text-center space-y-4">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform duration-500">
                          <Camera size={32} className="text-white/20" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Upload Your Frame</p>
                          <p className="text-[10px] text-white/30 uppercase tracking-widest mt-1">Portrait recommended</p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-8">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold font-serif italic flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-secondary/20 flex items-center justify-center text-brand-secondary">
                        <Shirt size={16} />
                      </div>
                      Layering Queue
                    </h3>
                    <span className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Step 02</span>
                  </div>

                  {selectedItems.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
                      {selectedItems.map((item, idx) => (
                        <div key={`${item.id}-${idx}`} className="relative group flex-shrink-0">
                          <div className="w-16 h-16 rounded-xl overflow-hidden border border-brand-primary/50 shadow-lg shadow-brand-primary/10">
                            <img src={item.image_data} className="w-full h-full object-cover" />
                          </div>
                          <div className="absolute -top-2 -right-2 w-5 h-5 bg-brand-primary text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                            {idx + 1}
                          </div>
                          <button 
                            onClick={() => toggleItemSelection(item)}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl"
                          >
                            <Trash2 size={12} className="text-red-400" />
                          </button>
                        </div>
                      ))}
                      <div className="w-16 h-16 rounded-xl border border-dashed border-white/10 flex items-center justify-center text-white/10 flex-shrink-0">
                        <Plus size={16} />
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 border border-dashed border-white/5 rounded-2xl text-center">
                      <p className="text-xs text-white/20 uppercase tracking-widest">Select items below to build your look</p>
                    </div>
                  )}
                  
                  {Object.entries(
                    wardrobe.reduce((acc, item) => {
                      const cat = item.category || 'Other';
                      if (!acc[cat]) acc[cat] = [];
                      acc[cat].push(item);
                      return acc;
                    }, {} as Record<string, WardrobeItem[]>)
                  ).map(([category, items]) => (
                    <div key={category} className="space-y-3">
                      <h4 className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold ml-1">{category}</h4>
                      <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x">
                        {(items as WardrobeItem[]).map(item => {
                          const isSelected = selectedItems.some(i => i.id === item.id);
                          return (
                            <button 
                              key={item.id}
                              onClick={() => toggleItemSelection(item)}
                              className={`flex-shrink-0 w-24 h-24 rounded-2xl overflow-hidden border-2 transition-all duration-500 snap-center relative ${isSelected ? 'border-brand-primary scale-110 shadow-lg shadow-brand-primary/20' : 'border-transparent opacity-40 hover:opacity-100'}`}
                            >
                              <img src={item.image_data} className="w-full h-full object-cover" />
                              {isSelected && (
                                <div className="absolute inset-0 bg-brand-primary/20 flex items-center justify-center">
                                  <CheckCircle2 size={24} className="text-white" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </section>

                <button 
                  onClick={handleTryOn}
                  disabled={loading || !userPhoto || selectedItems.length === 0}
                  className="group relative w-full h-20 bg-white text-black rounded-[2rem] font-black text-xl overflow-hidden transition-all duration-500 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-brand-primary to-brand-secondary opacity-0 group-hover:opacity-10 transition-opacity duration-500" />
                  <span className="relative z-10 flex items-center justify-center gap-3">
                    {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={24} />}
                    Neural Draping
                  </span>
                </button>
              </div>

              <div className="lg:col-span-7 space-y-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold font-serif italic flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                      <CheckCircle2 size={16} />
                    </div>
                    The Reveal
                  </h3>
                  <span className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Output</span>
                </div>
                <div className="aspect-[3/4] bg-zinc-900/30 rounded-[4rem] border border-white/5 flex flex-col items-center justify-center overflow-hidden relative shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
                  {tryOnResult ? (
                    <motion.img 
                      initial={{ opacity: 0, scale: 1.1 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 1 }}
                      src={tryOnResult} 
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <div className="text-center p-12 space-y-6">
                      <div className="w-24 h-24 bg-white/[0.02] rounded-full flex items-center justify-center mx-auto border border-white/5">
                        <ImageIcon size={32} className="text-white/10" />
                      </div>
                      <div>
                        <p className="text-2xl font-serif italic text-white/20">Awaiting Generation</p>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-white/10 mt-2 font-bold">Select parameters to begin</p>
                      </div>
                    </div>
                  )}
                  {loading && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center gap-8">
                      <div className="relative">
                        <div className="w-32 h-32 border-t-2 border-brand-primary rounded-full animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Sparkles className="text-brand-primary animate-pulse" size={32} />
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-serif italic text-white mb-2">Neural Draping</p>
                        {tryOnProgress && (
                          <p className="text-[10px] uppercase tracking-[0.4em] text-brand-primary font-black animate-pulse">
                            Layering {tryOnProgress.current} of {tryOnProgress.total}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.1);
        }
      `}</style>
    </div>
  );
}
