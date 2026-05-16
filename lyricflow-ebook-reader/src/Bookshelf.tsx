import { useState, useEffect } from 'react';
import { Upload, BookOpen } from 'lucide-react';

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
    <div className="min-h-screen bg-[#020617] text-white p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Lue Bookshelf</h1>
        
        <div className="mb-12">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/20 rounded-xl hover:border-white/50 hover:bg-white/5 cursor-pointer transition-all">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-8 h-8 mb-2 text-white/50" />
              <p className="text-sm text-white/50">
                {isUploading ? "Uploading..." : "Click to upload EPUB or drop file here"}
              </p>
            </div>
            <input type="file" className="hidden" accept=".epub,.pdf,.txt,.docx,.html,.rtf,.md" onChange={handleUpload} disabled={isUploading} />
          </label>
        </div>

        <h2 className="text-2xl font-semibold mb-6">Recent Books</h2>
        <div className="grid gap-4">
          {recentBooks.map((book, i) => (
            <button
              key={i}
              onClick={() => onOpenBook(book.path)}
              className="flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left"
            >
              <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{book.title}</h3>
                <div className="w-full bg-white/10 rounded-full h-1.5 mt-2">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${book.percentage}%` }}></div>
                </div>
              </div>
            </button>
          ))}
          {recentBooks.length === 0 && (
            <div className="text-white/50 italic">No recent books found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
