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
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Bookshelf from './Bookshelf';

const formatTime = (seconds: number) => {
  const totalSeconds = Math.floor(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const Word = memo(({ 
  wordText, 
  isActive, 
  start, 
  end, 
  currentTime, 
  onClick 
}: any) => {
  const isWordActive = isActive && currentTime >= start && currentTime < end;
  const isWordPast = isActive && currentTime >= end;
  
  const className = `word text-4xl md:text-6xl font-bold cursor-pointer transition-all duration-400 ${
    isWordActive 
      ? 'opacity-100 blur-0 scale-110 text-white' 
      : isActive
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
  const [showChapterList, setShowChapterList] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState(0);

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
    
    // Check if a book is already open
    fetch('/api/book_info')
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setBookInfo(data);
          setIsReading(true);
          setIsPlaying(!data.is_paused);
        }
      })
      .catch(err => console.error(err));
  }, []);

  const handleOpenBook = async (path: string) => {
    try {
      const res = await fetch('/api/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      const data = await res.json();
      
      if (res.status >= 400) {
        alert(data.detail || "Failed to open book");
        return;
      }
      
      setBookInfo(data);
      setIsReading(true);
      setSentences([]);
      // Do not reset currentPos here, let WebSocket provide it
      setIsPlaying(true);
    } catch (err) {
      console.error(err);
      alert("An unexpected error occurred while opening the book.");
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
      }, 10000);
    }
    return () => {
      if (hideControlsTimeoutRef.current) clearTimeout(hideControlsTimeoutRef.current);
    };
  }, [isPlaying, showControls, showChapterList]);

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

  const handleChapterClick = (cIdx: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        command: 'goto_chapter',
        c: cIdx
      }));
    }
    setShowChapterList(false);
    setIsPlaying(true);
    setShowControls(true);
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
  }, [sentences]);

  const chapterSentences = useMemo(() => sentences.filter(s => s.c === currentPos.c), [sentences, currentPos.c]);
  const chapterSentenceCount = chapterSentences.length;
  
  const sentenceDurations = useMemo(() => {
    return chapterSentences.map(s => s.duration || 5);
  }, [chapterSentences]);

  const totalChapterDuration = useMemo(() => {
    return sentenceDurations.reduce((a, b) => a + b, 0);
  }, [sentenceDurations]);

  const currentSentenceIndexInChapter = useMemo(() => chapterSentences.findIndex(s => s.c === currentPos.c && s.p === currentPos.p && s.s === currentPos.s), [chapterSentences, currentPos]);

  const elapsedChapterTime = useMemo(() => {
    if (currentSentenceIndexInChapter === -1) return 0;
    const prevSentencesDuration = sentenceDurations.slice(0, currentSentenceIndexInChapter).reduce((a, b) => a + b, 0);
    return prevSentencesDuration + currentTime;
  }, [sentenceDurations, currentSentenceIndexInChapter, currentTime]);

  const chapterProgress = totalChapterDuration > 0 ? Math.min(100, (elapsedChapterTime / totalChapterDuration) * 100) : 0;

  const updateHoverState = (clientX: number, clientY: number) => {
    if (!progressBarRef.current || chapterSentenceCount === 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    
    // Check vertical distance (20px)
    const distY = Math.abs(clientY - (rect.top + rect.height / 2));
    if (distY > 20) {
      setHoverTime(null);
      return;
    }
    
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const estimatedTime = ratio * totalChapterDuration;
    setHoverTime(estimatedTime);
    setHoverPos(clientX - rect.left);
  };

  const handleProgressBarSeek = (clientX: number) => {
    if (!progressBarRef.current || chapterSentenceCount === 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    
    let targetIndex = 0;
    let accumulated = 0;
    const targetTime = ratio * totalChapterDuration;
    for (let i = 0; i < sentenceDurations.length; i++) {
      accumulated += sentenceDurations[i];
      if (accumulated >= targetTime) {
        targetIndex = i;
        break;
      }
      targetIndex = i;
    }

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
  const handleProgressMouseMove = (e: MouseEvent) => { 
    if (isDraggingRef.current) handleProgressBarSeek(e.clientX); 
    updateHoverState(e.clientX, e.clientY);
  };
  const handleProgressMouseUp = () => { isDraggingRef.current = false; };
  const handleProgressBarMouseEnter = (e: React.MouseEvent) => { updateHoverState(e.clientX, e.clientY); };
  const handleProgressBarMouseLeave = () => { setHoverTime(null); };

  useEffect(() => {
    window.addEventListener('mousemove', handleProgressMouseMove);
    window.addEventListener('mouseup', handleProgressMouseUp);
    return () => { window.removeEventListener('mousemove', handleProgressMouseMove); window.removeEventListener('mouseup', handleProgressMouseUp); };
  }, [totalChapterDuration, chapterSentences, sentenceDurations]);

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
    <div className="relative h-full w-full flex flex-col overflow-hidden font-sans select-none">
      <div id="background-gradient" />
      <div className="relative z-10 flex flex-col gap-4 px-8 pt-6 pb-4 shrink-0">
        <div className="flex">
          <button className="text-white/20 hover:text-white/60 transition-colors text-[9px] font-bold uppercase tracking-[0.2em] border border-white/5 px-2.5 py-1 rounded-full" onClick={() => { setIsReading(false); audioRef.current?.pause(); wsRef.current?.close(); }}>
            Back
          </button>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative w-[80px] h-[80px] rounded-xl overflow-hidden shadow-2xl shrink-0 pointer-events-none border border-white/20 flex items-center justify-center bg-transparent">
            {bookInfo?.cover_url ? (
              <img src={bookInfo.cover_url} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <span 
                className="text-4xl font-black uppercase select-none"
                style={{ 
                  color: 'transparent',
                  WebkitTextStroke: '1.5px rgba(255, 255, 255, 0.2)'
                }}
              >
                {bookInfo?.title?.charAt(0) || "B"}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="overflow-hidden whitespace-nowrap relative">
              <div className="inline-block animate-marquee hover:pause-animation">
                <h1 className="text-white font-bold text-3xl tracking-tight leading-tight inline-block mr-12">
                  {bookInfo?.title || "Reading"}
                </h1>
                <h1 className="text-white font-bold text-3xl tracking-tight leading-tight inline-block mr-12">
                  {bookInfo?.title || "Reading"}
                </h1>
              </div>
            </div>
            <div className="flex justify-between items-center w-full mt-2">
              <p className="text-white/50 text-lg font-semibold uppercase tracking-wider truncate mr-8">{bookInfo?.author || "UNKNOWN AUTHOR"}</p>
              <p className="text-white/50 text-sm font-bold uppercase tracking-widest shrink-0 ml-auto">CHAPTER {currentPos.c + 1}/{bookInfo?.chapters || 1}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="relative z-10 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {showChapterList ? (
            <motion.div 
              key="chapter-list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="absolute inset-0 z-10 overflow-y-auto px-10 md:px-20 py-8 scrollbar-hide"
              style={{
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
              }}
            >
              <div className="flex flex-col gap-2 pb-48">
                <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mb-6 px-3">Chapters</p>
                {bookInfo?.chapter_titles?.map((title: string, idx: number) => (
                  <button 
                    key={idx}
                    onClick={() => handleChapterClick(idx)}
                    className="flex items-center gap-4 p-3 rounded-xl transition-all group hover:bg-white/5"
                  >
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden shadow-lg shrink-0 border border-white/10 flex items-center justify-center bg-transparent">
                      {bookInfo?.cover_url ? (
                        <img src={bookInfo.cover_url} alt="Cover" className="w-full h-full object-cover" />
                      ) : (
                        <span 
                          className="text-2xl font-black uppercase select-none"
                          style={{ 
                            color: 'transparent',
                            WebkitTextStroke: '1px rgba(255, 255, 255, 0.2)'
                          }}
                        >
                          {bookInfo?.title?.charAt(0) || "B"}
                        </span>
                      )}
                      {idx === currentPos.c && isPlaying && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="flex gap-0.5 items-end h-3">
                            <motion.div animate={{ height: [4, 12, 6, 12, 4] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-0.5 bg-white" />
                            <motion.div animate={{ height: [8, 4, 12, 4, 8] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-0.5 bg-white" />
                            <motion.div animate={{ height: [6, 10, 4, 10, 6] }} transition={{ repeat: Infinity, duration: 0.7 }} className="w-0.5 bg-white" />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className={`text-xs font-bold uppercase tracking-widest ${idx === currentPos.c ? 'text-white' : 'text-white/40'}`}>
                        Chapter {idx + 1}
                      </p>
                      {title && (
                        <p className={`text-sm truncate ${idx === currentPos.c ? 'text-white/90 font-medium' : 'text-white/60 font-normal'}`}>
                          {title}
                        </p>
                      )}
                    </div>
                    {idx === currentPos.c && (
                      <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_white]" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="lyrics"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 z-10 overflow-y-auto px-10 md:px-20 py-12 lyrics-container scrollbar-hide"
              ref={scrollContainerRef}
              onScroll={handleScroll}
              style={{
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
              }}
            >
              <div className="flex flex-col gap-12 pb-[30vh]">
                {visibleSentences.map((line: any) => {
                  const sIdx = line.originalIdx;
                  const isActive = sIdx === currentSentenceIndex;
                  return <Sentence key={`${currentPos.c}-${sIdx}`} line={line} sIdx={sIdx} isActive={isActive} currentTime={isActive ? currentTime : 0} onWordClick={handleWordClick} activeLineRef={activeLineRef} />;
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div 
        className="absolute bottom-0 left-0 right-0 h-[60px] z-50 pointer-events-none flex items-center justify-center"
      >
        <button 
          className="pointer-events-auto p-4 flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            if (showControls) {
              setShowControls(false);
            } else if (showChapterList) {
              setShowChapterList(false);
            } else {
              setShowControls(true);
            }
          }}
        >
          { (showControls || showChapterList) ? (
            <ChevronDown className="w-5 h-5 text-white/20 animate-bounce" />
          ) : (
            <ChevronUp className="w-5 h-5 text-white/20 animate-bounce" />
          )}
        </button>
      </div>
      <AnimatePresence>
        {showControls && (
          <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} transition={{ duration: 0.6, ease: [0.2, 0, 0.2, 1] }} className="absolute bottom-0 left-0 right-0 z-40 control-bar px-8 pt-16 pb-12">
            <div className="max-w-4xl mx-auto">
              <div className="mb-8 relative">
                {hoverTime !== null && (
                  <div 
                    className="absolute bottom-full mb-2 bg-white/90 text-black text-[10px] font-bold px-1.5 py-0.5 rounded shadow-lg pointer-events-none -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${hoverPos}px` }}
                  >
                    {formatTime(hoverTime)}
                  </div>
                )}
                <div
                  ref={progressBarRef}
                  className="relative w-full h-1 bg-white/10 rounded-full shadow-inner cursor-pointer"
                  onMouseDown={handleProgressMouseDown}
                  onMouseEnter={handleProgressBarMouseEnter}
                  onMouseLeave={handleProgressBarMouseLeave}
                  onMouseMove={(e) => updateHoverState(e.clientX, e.clientY)}
                >
                  <motion.div 
                    className="absolute h-full bg-white"
                    style={{ width: `${chapterProgress}%` }}
                    transition={{ duration: 0.1, ease: "linear" }}
                  />
                </div>
                <div className="flex justify-between mt-4 text-[11px] font-mono opacity-50 tracking-wider">
                  <span>{formatTime(elapsedChapterTime)}</span>
                  <span>-{formatTime(Math.max(0, totalChapterDuration - elapsedChapterTime))}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-10 mb-8">
                <button 
                  className={`transition-all ${currentPos.c > 0 ? 'text-white/70 hover:text-white hover:scale-110 active:scale-95' : 'text-white/10 pointer-events-none'}`} 
                  onClick={() => { if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ command: 'prev_chapter' })); }}
                >
                  <SkipBack className="w-8 h-8 fill-current" />
                </button>
                <button 
                  onClick={togglePlayPause}
                  className="w-16 h-16 flex items-center justify-center text-white hover:scale-110 active:scale-90 transition-all"
                >
                  {isPlaying ? (
                    <Pause className="w-10 h-10 fill-current" />
                  ) : (
                    <Play className="w-10 h-10 fill-current translate-x-[3px]" />
                  )}
                </button>
                <button 
                  className={`transition-all ${bookInfo && currentPos.c < bookInfo.chapters - 1 ? 'text-white/70 hover:text-white hover:scale-110 active:scale-95' : 'text-white/10 pointer-events-none'}`} 
                  onClick={() => { if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ command: 'next_chapter' })); }}
                >
                  <SkipForward className="w-8 h-8 fill-current" />
                </button>
              </div>
              <div className="flex items-center justify-between opacity-40 hover:opacity-100 transition-opacity mt-4 px-2">
                <button className="hover:text-white transition-colors">
                  <MessageSquare className="w-6 h-6" />
                </button>
                <button className={`transition-colors ${showChapterList ? 'text-white' : 'hover:text-white'}`} onClick={() => setShowChapterList(!showChapterList)}>
                  <ListMusic className="w-6 h-6" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
