import { useState, useEffect } from 'react';
import { Plus, BookOpen } from 'lucide-react';
import { motion } from 'motion/react';

export default function Bookshelf({ onOpenBook }: { onOpenBook: (path: string) => void }) {
  const [recentBooks, setRecentBooks] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetch('/api/recent_books')
      .then(r => r.json())
      .then(data => setRecentBooks(data.books || []))
      .catch(err => console.error(err));
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.path) {
        onOpenBook(data.path);
      }
    } catch (err) {
      console.error(err);
    }
    setIsUploading(false);
  };

  return (
    <div className="relative h-full w-full flex flex-col overflow-hidden font-sans select-none">
      <div id="background-gradient" />
      
      <div className="relative z-10 flex-1 overflow-y-auto px-8 md:px-20 py-20 scrollbar-hide">
        <div className="flex flex-col gap-12">
          {recentBooks.map((book, i) => (
            <button
              key={i}
              onClick={() => onOpenBook(book.path)}
              className="flex items-center gap-6 group text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="relative w-[80px] h-[80px] rounded-xl overflow-hidden shadow-2xl shrink-0">
                <img src="https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000&auto=format&fit=crop" alt="Cover" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="overflow-hidden whitespace-nowrap relative">
                  <div className={`inline-block ${book.title.length > 25 ? 'animate-marquee' : ''}`}>
                    <h3 className="text-white font-bold text-3xl tracking-tight leading-tight inline-block mr-12">
                      {book.title}
                    </h3>
                    {book.title.length > 25 && (
                      <h3 className="text-white font-bold text-3xl tracking-tight leading-tight inline-block mr-12">
                        {book.title}
                      </h3>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center w-full mt-2">
                  <p className="text-white/50 text-lg font-semibold uppercase tracking-wider truncate mr-8">
                    {book.author || "UNKNOWN AUTHOR"}
                  </p>
                  <p className="text-white/50 text-sm font-bold uppercase tracking-widest shrink-0 ml-auto">
                    CHAPTER {book.current_c + 1}/{book.total_chapters || 1}
                  </p>
                </div>
              </div>
            </button>
          ))}
          {recentBooks.length === 0 && (
            <div className="text-white/20 text-center py-20 italic font-medium tracking-widest uppercase text-sm">
              Your bookshelf is empty
            </div>
          )}
        </div>
      </div>

      {/* Floating Upload Button */}
      <div className="absolute bottom-10 right-10 z-50">
        <label className={`flex items-center justify-center w-16 h-16 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full cursor-pointer transition-all shadow-2xl backdrop-blur-xl ${isUploading ? 'animate-pulse opacity-50' : ''}`}>
          <Plus className={`w-8 h-8 text-white/80 ${isUploading ? 'animate-spin' : ''}`} />
          <input type="file" className="hidden" accept=".epub,.pdf,.txt,.docx,.html,.rtf,.md" onChange={handleUpload} disabled={isUploading} />
        </label>
      </div>
    </div>
  );
}
