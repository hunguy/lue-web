import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  MessageSquare, 
  Share2, 
  ListMusic, 
  MoreHorizontal, 
  Star 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Bookshelf from './Bookshelf';

const formatTime = (seconds: number) => {
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const Word = memo(({ 
  wordText, 
  isActive, 
  isPast, 
  start, 
  end, 
  currentTime, 
  onClick 
}: any) => {
  const isWordActive = isActive && currentTime >= start && currentTime < end;
  const isWordPast = isPast || (isActive && currentTime >= end);
  
  const className = `word text-4xl md:text-6xl font-bold cursor-pointer transition-all duration-400 ${
    isWordActive 
      ? 'opacity-100 blur-0 scale-110 text-white' 
      : isWordPast 
        ? 'opacity-60 blur-0 scale-100 text-white/80' 
        : 'opacity-20 blur-[2px] scale-95 text-white/30'
  }`;

  return (
    <motion.span
      onClick={onClick}
      className={className}
      animate={isWordActive ? {
        textShadow: "0 0 30px rgba(255,255,255,0.4)"
      } : {
        textShadow: "none"
      }}
    >
      {wordText}
    </motion.span>
  );
});

const Sentence = memo(({ 
  line, 
  sIdx, 
  isActive, 
  isPast, 
  currentTime, 
  onWordClick,
  activeLineRef
}: any) => {
  const words = line.words || [];
  const timings = line.timing?.word_timings || [];
  const mapping = line.timing?.word_mapping || [];

  return (
    <div 
      ref={isActive ? activeLineRef : null}
      className={`transition-all duration-700 ease-out ${
        isActive ? 'scale-105 origin-left' : 'scale-100'
      }`}
    >
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {words.map((wordText: string, wIdx: number) => {
          let start = 0;
          let end = 0;
          if (mapping && mapping[wIdx] !== undefined) {
             const timingInfo = timings[mapping[wIdx]];
             if (timingInfo && timingInfo.length === 3) {
                start = timingInfo[1] || 0;
                end = timingInfo[2] || 0;
             }
          } else if (timings && timings[wIdx] && timings[wIdx].length === 3) {
             start = timings[wIdx][1] || 0;
             end = timings[wIdx][2] || 0;
          }
          
          return (
            <Word 
              key={wIdx}
              wordText={wordText}
              isActive={isActive}
              isPast={isPast}
              start={start}
              end={end}
              currentTime={isActive ? currentTime : 0}
              onClick={(e: any) => {
                e.stopPropagation();
                onWordClick(sIdx, wIdx);
              }}
            />
          );
        })}
      </div>
    </div>
  );
});

export default function App() {
  const [isReading, setIsReading] = useState(false);
  const [bookInfo, setBookInfo] = useState<any>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const [sentences, setSentences] = useState<any[]>([]);
  const [currentPos, setCurrentPos] = useState({c: -1, p: -1, s: -1});

  const currentSentenceIndex = useMemo(() => {
    const idx = sentences.findIndex(s => s.c === currentPos.c && s.p === currentPos.p && s.s === currentPos.s);
    return idx !== -1 ? idx : 0;
  }, [sentences, currentPos]);

  // Lazy Window logic
  const windowSize = 40;
  const windowOffset = 15;
  const visibleSentences = useMemo(() => {
    if (sentences.length <= windowSize) return sentences.map((s, i) => ({ ...s, originalIdx: i }));
    let start = Math.max(0, currentSentenceIndex - windowOffset);
    let end = Math.min(sentences.length, start + windowSize);
    if (end === sentences.length) start = Math.max(0, end - windowSize);
    return sentences.slice(start, end).map((s, i) => ({ ...s, originalIdx: start + i }));
  }, [sentences, currentSentenceIndex]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const hideControlsTimeoutRef = useRef<number | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const pendingSeekWordIdxRef = useRef<number | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const clearQueueTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
  }, []);

  const handleOpenBook = async (path: string) => {
    try {
      const res = await fetch('/api/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      const data = await res.json();
      setBookInfo(data);
      setIsReading(true);
      setSentences([]);
      setCurrentPos({ c: 0, p: 0, s: 0 });
      setIsPlaying(true);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!isReading) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;
    
    ws.onopen = () => {
      ws.send(JSON.stringify({ command: 'get_current_context' }));
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'chapter_data') {
        setSentences(data.sentences);
        setCurrentPos({ c: data.c, p: data.current_p, s: data.current_s });
      } else if (data.type === 'new_sentence') {
        setSentences(prev => {
          const idx = prev.findIndex(s => s.c === data.c && s.p === data.p && s.s === data.s);
          if (idx !== -1) {
            const newData = [...prev];
            newData[idx] = { ...newData[idx], ...data };
            return newData;
          } else {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ command: 'get_current_context' }));
            }
            return prev;
          }
        });
        setCurrentPos({ c: data.c, p: data.p, s: data.s });
      } else if (data.type === 'clear_queue') {
        if (clearQueueTimeoutRef.current) clearTimeout(clearQueueTimeoutRef.current);
        clearQueueTimeoutRef.current = window.setTimeout(() => {
          setCurrentTime(0);
          setSentences(prev => prev.map(s => ({ ...s, audio_url: undefined, timing: undefined, duration: undefined })));
          clearQueueTimeoutRef.current = null;
        }, 150);
      } else if (data.type === 'status') {
        if (data.is_paused) {
          setIsPlaying(false);
          audioRef.current?.pause();
        } else {
          setIsPlaying(true);
          audioRef.current?.play().catch(e => console.error(e));
        }
      }
    };
    
    return () => {
      ws.close();
      audioRef.current?.pause();
    };
  }, [isReading]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedData = () => {
      const s = sentences[currentSentenceIndex];
      
      if (pendingSeekWordIdxRef.current !== null && s?.timing?.word_timings) {
        const wIdx = pendingSeekWordIdxRef.current;
        const mapping = s.timing.word_mapping;
        const timings = s.timing.word_timings;
        
        let seekTime = 0;
        if (mapping && mapping[wIdx] !== undefined) {
           const t = timings[mapping[wIdx]];
           if (t) seekTime = t[1] || 0;
        } else if (timings[wIdx]) {
           seekTime = timings[wIdx][1] || 0;
        }
        
        audio.currentTime = seekTime;
        pendingSeekWordIdxRef.current = null;
        pendingSeekTimeRef.current = null;
      } else if (pendingSeekTimeRef.current !== null) {
        audio.currentTime = pendingSeekTimeRef.current;
        pendingSeekTimeRef.current = null;
      }

      if (isPlaying) {
        audio.play().catch(e => console.error(e));
      }
    };
    
    audio.addEventListener('loadeddata', onLoadedData);

    if (sentences.length > currentSentenceIndex) {
      const s = sentences[currentSentenceIndex];
      const fullUrl = s.audio_url ? s.audio_url : '';
      
      if (!fullUrl) {
        audio.pause();
        audio.removeAttribute('src');
        currentAudioUrlRef.current = null;
      } else if (fullUrl !== currentAudioUrlRef.current) {
        audio.src = fullUrl;
        audio.load();
        currentAudioUrlRef.current = fullUrl;
      } else {
        if (isPlaying) {
          audio.play().catch(e => console.error(e));
        } else {
          audio.pause();
        }
      }

      return () => {
        audio.removeEventListener('loadeddata', onLoadedData);
      };
    }
  }, [sentences, currentSentenceIndex, isPlaying]);

  useEffect(() => {
    let intervalId: number;
    if (isPlaying) {
      intervalId = window.setInterval(() => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
        }
      }, 50);
    }
    return () => clearInterval(intervalId);
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying && showControls) {
      if (hideControlsTimeoutRef.current) clearTimeout(hideControlsTimeoutRef.current);
      hideControlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 5000);
    }
    return () => {
      if (hideControlsTimeoutRef.current) clearTimeout(hideControlsTimeoutRef.current);
    };
  }, [isPlaying, showControls]);

  useEffect(() => {
    if (!isUserScrolling && activeLineRef.current && scrollContainerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [currentSentenceIndex, isUserScrolling, visibleSentences]);

  const handleScroll = () => {
    setIsUserScrolling(true);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = window.setTimeout(() => {
      setIsUserScrolling(false);
    }, 2500);
  };

  const handleWordClick = useCallback((sentenceIdx: number, wIdx: number) => {
    const targetSentence = sentences[sentenceIdx];
    if (!targetSentence) return;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    setIsUserScrolling(false);
    pendingSeekWordIdxRef.current = wIdx;
    setSentences(prev => {
      const newData = [...prev];
      if (newData[sentenceIdx]) newData[sentenceIdx] = { ...newData[sentenceIdx], audio_url: undefined };
      return newData;
    });
    setCurrentPos({ c: targetSentence.c, p: targetSentence.p, s: targetSentence.s });
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command: 'seek', c: targetSentence.c, p: targetSentence.p, s: targetSentence.s }));
    }
    setIsPlaying(true);
    setShowControls(true);
  }, [sentences]);

  const chapterSentences = useMemo(() => sentences.filter(s => s.c === currentPos.c), [sentences, currentPos.c]);
  const chapterSentenceCount = chapterSentences.length;
  const currentSentenceIndexInChapter = useMemo(() => chapterSentences.findIndex(s => s.c === currentPos.c && s.p === currentPos.p && s.s === currentPos.s), [chapterSentences, currentPos]);
  const chapterProgress = chapterSentenceCount > 0 ? Math.min(100, ((currentSentenceIndexInChapter + (currentTime / (sentences[currentSentenceIndex]?.duration || 1))) / chapterSentenceCount) * 100) : 0;

  const handleProgressBarSeek = (clientX: number) => {
    if (!progressBarRef.current || chapterSentenceCount === 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const targetIndex = Math.floor(ratio * chapterSentenceCount);
    const targetSentence = chapterSentences[Math.min(targetIndex, chapterSentenceCount - 1)];
    if (!targetSentence) return;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    setIsUserScrolling(false);
    pendingSeekWordIdxRef.current = 0;
    setCurrentPos({ c: targetSentence.c, p: targetSentence.p, s: targetSentence.s });
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command: 'seek', c: targetSentence.c, p: targetSentence.p, s: targetSentence.s }));
    }
    setIsPlaying(true);
    setShowControls(true);
  };

  const handleProgressMouseDown = (e: React.MouseEvent) => { e.stopPropagation(); isDraggingRef.current = true; handleProgressBarSeek(e.clientX); };
  const handleProgressMouseMove = (e: MouseEvent) => { if (isDraggingRef.current) handleProgressBarSeek(e.clientX); };
  const handleProgressMouseUp = () => { isDraggingRef.current = false; };

  useEffect(() => {
    window.addEventListener('mousemove', handleProgressMouseMove);
    window.addEventListener('mouseup', handleProgressMouseUp);
    return () => { window.removeEventListener('mousemove', handleProgressMouseMove); window.removeEventListener('mouseup', handleProgressMouseUp); };
  }, [chapterSentenceCount, chapterSentences, sentences]);

  const togglePlayPause = (e: any) => {
    e.stopPropagation();
    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);
    if (newIsPlaying) audioRef.current?.play().catch(e => console.error(e));
    else audioRef.current?.pause();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ command: 'pause' }));
    setShowControls(true);
  };

  if (!isReading) return <Bookshelf onOpenBook={handleOpenBook} />;

  return (
    <div className="relative h-full w-full overflow-hidden font-sans select-none">
      <div id="background-gradient" />
      <div className="relative z-10 flex items-center justify-between px-8 py-8">
        <div className="flex items-center gap-5">
          <motion.img initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} src="https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000&auto=format&fit=crop" alt="Cover" className="w-[60px] h-[60px] rounded-lg shadow-[0_8px_16px_rgba(0,0,0,0.5)]" />
          <div>
            <h1 className="text-white font-bold text-xl tracking-tight leading-tight">{bookInfo?.title || "Reading"}</h1>
            <p className="text-white/50 text-sm font-medium uppercase tracking-widest">Lue Reader</p>
          </div>
        </div>
        <div className="flex gap-6 text-white/60">
          <button className="hover:text-white transition-colors"><Star className="w-6 h-6" /></button>
          <button className="hover:text-white transition-colors" onClick={() => { setIsReading(false); audioRef.current?.pause(); wsRef.current?.close(); }}><MoreHorizontal className="w-6 h-6" /></button>
        </div>
      </div>
      <div className="relative z-10 h-[60%] overflow-y-auto px-10 md:px-20 py-12 lyrics-container" ref={scrollContainerRef} onScroll={handleScroll} style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)' }}>
        <div className="flex flex-col gap-12 pb-[30vh]">
          {visibleSentences.map((line: any) => {
            const sIdx = line.originalIdx;
            const isActive = sIdx === currentSentenceIndex;
            return <Sentence key={`${currentPos.c}-${sIdx}`} line={line} sIdx={sIdx} isActive={isActive} isPast={sIdx < currentSentenceIndex} currentTime={isActive ? currentTime : 0} onWordClick={handleWordClick} activeLineRef={activeLineRef} />;
          })}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[100px] z-50 cursor-pointer" onClick={(e) => { e.stopPropagation(); setShowControls(true); }} />
      <AnimatePresence>
        {showControls && (
          <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} transition={{ duration: 0.6, ease: [0.2, 0, 0.2, 1] }} className="absolute bottom-0 left-0 right-0 z-40 control-bar px-8 pt-16 pb-12">
            <div className="max-w-4xl mx-auto">
              <div className="mb-8">
                <div ref={progressBarRef} className="relative w-full h-1 bg-white/10 rounded-full overflow-hidden shadow-inner cursor-pointer" onMouseDown={handleProgressMouseDown}>
                  <motion.div className="absolute h-full bg-white" style={{ width: `${chapterProgress}%` }} transition={{ duration: 0.1, ease: "linear" }} />
                </div>
                <div className="flex justify-between mt-4 text-[11px] font-mono opacity-50 tracking-wider"><span>Chapter {currentPos.c + 1}</span><span>{bookInfo?.chapters || 1} chapters</span></div>
              </div>
              <div className="flex items-center justify-center gap-10 mb-8">
                {currentPos.c > 0 && <button className="text-white/70 hover:text-white hover:scale-110 active:scale-95 transition-all" onClick={() => { if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ command: 'prev_chapter' })); }}><SkipBack className="w-8 h-8 fill-current" /></button>}
                <button onClick={togglePlayPause} className="w-16 h-16 flex items-center justify-center text-white hover:scale-110 active:scale-90 transition-all">{isPlaying ? <Pause className="w-10 h-10 fill-current" /> : <Play className="w-10 h-10 fill-current translate-x-[3px]" />}</button>
                {bookInfo && currentPos.c < bookInfo.chapters - 1 && <button className="text-white/70 hover:text-white hover:scale-110 active:scale-95 transition-all" onClick={() => { if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ command: 'next_chapter' })); }}><SkipForward className="w-8 h-8 fill-current" /></button>}
              </div>
              <div className="flex items-center justify-between opacity-40 hover:opacity-100 transition-opacity mt-4 px-2"><button className="hover:text-white transition-colors"><MessageSquare className="w-6 h-6" /></button><button className="hover:text-white transition-colors"><ListMusic className="w-6 h-6" /></button></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
