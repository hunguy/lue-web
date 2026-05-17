import { useState, useEffect, useRef } from 'react';
import { Plus, BookOpen, Trash2, Edit2, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const VOICES = [
  { group: "Vietnamese", voices: [
    { id: "vi-VN-HoaiMyNeural", label: "HoaiMy (Female)" },
    { id: "vi-VN-NamMinhNeural", label: "NamMinh (Male)" }
  ]},
  { group: "English (UK)", voices: [
    { id: "en-GB-RyanNeural", label: "Ryan (Male)" },
    { id: "en-GB-SoniaNeural", label: "Sonia (Female)" },
    { id: "en-GB-ThomasNeural", label: "Thomas (Male)" }
  ]},
  { group: "English (US)", voices: [
    { id: "en-US-ChristopherNeural", label: "Christopher (Male)" },
    { id: "en-US-EricNeural", label: "Eric (Male)" },
    { id: "en-US-GuyNeural", label: "Guy (Male)" },
    { id: "en-US-JennyNeural", label: "Jenny (Female) - Default" },
    { id: "en-US-MichelleNeural", label: "Michelle (Female)" },
    { id: "en-US-RogerNeural", label: "Roger (Male)" },
    { id: "en-US-SteffanNeural", label: "Steffan (Male)" }
  ]},
  { group: "English (Australia)", voices: [
    { id: "en-AU-NatashaNeural", label: "Natasha (Female)" },
    { id: "en-AU-WilliamNeural", label: "William (Male)" }
  ]}
];

interface Book {
  title: string;
  author: string;
  voice: string;
  path: string;
  percentage: number;
  current_c: number;
  total_chapters: number;
}

export default function Bookshelf({ onOpenBook }: { onOpenBook: (path: string) => void }) {
  const [recentBooks, setRecentBooks] = useState<Book[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [deletingBook, setDeletingBook] = useState<Book | null>(null);
  const [swipedBookIdx, setSwipedBookIdx] = useState<number | null>(null);
  const dragActiveRef = useRef(false);

  const [editForm, setEditForm] = useState({ title: '', author: '', voice: '' });

  const fetchBooks = () => {
    fetch('/api/recent_books')
      .then(r => r.json())
      .then(data => setRecentBooks(data.books || []))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchBooks();
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

  const handleDelete = async () => {
    if (!deletingBook) return;
    try {
      await fetch('/api/delete_book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: deletingBook.path })
      });
      setDeletingBook(null);
      fetchBooks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdate = async () => {
    if (!editingBook) return;
    try {
      await fetch('/api/update_metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          path: editingBook.path,
          ...editForm
        })
      });
      setEditingBook(null);
      fetchBooks();
    } catch (err) {
      console.error(err);
    }
  };

  const openEditModal = (book: Book) => {
    setEditingBook(book);
    setEditForm({ title: book.title, author: book.author, voice: book.voice });
  };

  return (
    <div className="relative h-full w-full flex flex-col overflow-hidden font-sans select-none">
      <div id="background-gradient" />
      
      <div className="relative z-10 flex-1 overflow-y-auto px-4 md:px-20 py-20 scrollbar-hide">
        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
          {recentBooks.map((book, i) => (
            <div key={i} className="relative group">
              {/* Action Buttons (behind) */}
              <div className="absolute inset-0 flex justify-end overflow-hidden rounded-2xl">
                <div className="flex h-full">
                  <button 
                    onClick={(e) => { e.stopPropagation(); openEditModal(book); }}
                    className="flex flex-col items-center justify-center w-24 h-full bg-blue-600 hover:bg-blue-500 transition-colors text-white gap-1"
                  >
                    <Edit2 className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Edit</span>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setDeletingBook(book); }}
                    className="flex flex-col items-center justify-center w-24 h-full bg-red-600 hover:bg-red-500 transition-colors text-white gap-1"
                  >
                    <Trash2 className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Delete</span>
                  </button>
                </div>
              </div>

              {/* Foreground Item */}
              <motion.button
                drag="x"
                dragConstraints={{ left: -192, right: 0 }}
                dragElastic={0.05}
                animate={{ x: swipedBookIdx === i ? -192 : 0 }}
                onDragStart={() => {
                  dragActiveRef.current = true;
                }}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -40) {
                    setSwipedBookIdx(i);
                  } else if (info.offset.x > 40) {
                    setSwipedBookIdx(null);
                  }
                  setTimeout(() => { dragActiveRef.current = false; }, 100);
                }}
                onTap={() => {
                  if (dragActiveRef.current) return;
                  
                  if (swipedBookIdx === i) {
                    setSwipedBookIdx(null);
                  } else {
                    onOpenBook(book.path);
                  }
                }}
                className="relative z-10 w-full flex items-center gap-6 p-4 rounded-2xl bg-zinc-900 border border-white/5 text-left shadow-xl"
              >
                <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden shadow-2xl shrink-0 pointer-events-none">
                  <img src="https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000&auto=format&fit=crop" alt="Cover" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 pointer-events-none">
                  <div className="overflow-hidden whitespace-nowrap relative">
                    <div className={`inline-block ${book.title.length > 20 ? 'animate-marquee' : ''}`}>
                      <h3 className="text-white font-bold text-xl md:text-2xl tracking-tight leading-tight inline-block mr-12">
                        {book.title}
                      </h3>
                      {book.title.length > 20 && (
                        <h3 className="text-white font-bold text-xl md:text-2xl tracking-tight leading-tight inline-block mr-12">
                          {book.title}
                        </h3>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center w-full mt-1">
                    <p className="text-white/50 text-sm md:text-base font-semibold uppercase tracking-wider truncate mr-4">
                      {book.author || "UNKNOWN AUTHOR"}
                    </p>
                    <p className="text-white/40 text-[10px] md:text-xs font-bold uppercase tracking-widest shrink-0">
                      CHAPTER {book.current_c + 1}/{book.total_chapters}
                    </p>
                  </div>
                </div>
              </motion.button>
            </div>
          ))}
          
          {recentBooks.length === 0 && (
            <div className="text-white/20 text-center py-20 italic font-medium tracking-widest uppercase text-xs">
              Your bookshelf is empty
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingBook && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-2xl">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-lg bg-zinc-900/90 border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold text-white tracking-tight">Edit Book Details</h2>
                  <button onClick={() => setEditingBook(null)} className="text-white/40 hover:text-white transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 ml-1">Title</label>
                    <input 
                      type="text" 
                      value={editForm.title}
                      onChange={e => setEditForm({...editForm, title: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 ml-1">Author</label>
                    <input 
                      type="text" 
                      value={editForm.author}
                      onChange={e => setEditForm({...editForm, author: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 ml-1">TTS Voice</label>
                    <select 
                      value={editForm.voice}
                      onChange={e => setEditForm({...editForm, voice: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors appearance-none"
                    >
                      {VOICES.map(group => (
                        <optgroup key={group.group} label={group.group} className="bg-zinc-900">
                          {group.voices.map(v => (
                            <option key={v.id} value={v.id}>{v.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-10 flex gap-4">
                  <button 
                    onClick={() => setEditingBook(null)}
                    className="flex-1 py-4 rounded-2xl border border-white/10 text-white font-bold uppercase tracking-widest text-xs hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleUpdate}
                    className="flex-1 py-4 rounded-2xl bg-white text-black font-bold uppercase tracking-widest text-xs hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" /> Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingBook && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-2xl">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-sm bg-zinc-900/90 border border-white/10 rounded-3xl shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Delete Book?</h2>
              <p className="text-white/50 mb-8">Are you sure you want to remove "{deletingBook.title}"? This will also delete your reading progress.</p>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleDelete}
                  className="w-full py-4 rounded-2xl bg-red-600 text-white font-bold uppercase tracking-widest text-xs hover:bg-red-700 transition-colors"
                >
                  Delete Book
                </button>
                <button 
                  onClick={() => setDeletingBook(null)}
                  className="w-full py-4 rounded-2xl bg-white/5 text-white font-bold uppercase tracking-widest text-xs hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Upload Button */}
      <div className="absolute bottom-10 right-10 z-[60]">
        <label className={`flex items-center justify-center w-16 h-16 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full cursor-pointer transition-all shadow-2xl backdrop-blur-xl ${isUploading ? 'animate-pulse opacity-50' : ''}`}>
          <Plus className={`w-8 h-8 text-white/80 ${isUploading ? 'animate-spin' : ''}`} />
          <input type="file" className="hidden" accept=".epub,.pdf,.txt,.docx,.html,.rtf,.md" onChange={handleUpload} disabled={isUploading} />
        </label>
      </div>
    </div>
  );
}
