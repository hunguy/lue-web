import os
import sys
import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import shutil
import platformdirs

from lue import config, progress_manager, content_parser, audio
from lue.reader import Lue
from lue.tts_manager import TTSManager, get_default_tts_model_name

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_connections = []
active_reader = None

class WebLue(Lue):
    def __init__(self, file_path, tts_model, overlap=None):
        super().__init__(file_path, tts_model, overlap)
        self.is_web = True
        self.websockets = []
        self.last_sentence_msg = None

    async def broadcast(self, message):
        if message.get("type") == "new_sentence":
            self.last_sentence_msg = message
        disconnected = []
        for ws in self.websockets:
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.websockets.remove(ws)

    def _post_command_sync(self, cmd):
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self._post_command(cmd), self.loop)

    async def _post_command(self, cmd):
        self.pending_commands.append(cmd)
        self.command_received_event.set()
        
    async def run(self):
        self.loop = asyncio.get_running_loop()
        if not self.chapters or not self.chapters[0]: return
        
        await audio.play_from_current_position(self)
        
        while self.running:
            await self.command_received_event.wait()
            self.command_received_event.clear()
            cmd = self.pending_commands.pop(0) if self.pending_commands else None
            if not cmd: continue
            
            if self.pending_commands:
                self.command_received_event.set()
            
            
            if cmd == 'quit': break
            elif cmd == 'pause':
                if not self.tts_model: continue
                self.is_paused = not self.is_paused
                self._save_extended_progress()
                self.current_pause_toggle_task = asyncio.create_task(self._handle_pause_toggle())
                await self.broadcast({"type": "status", "is_paused": self.is_paused})
            elif isinstance(cmd, str) and ('next' in cmd or 'prev' in cmd):
                current_pos = (self.chapter_idx, self.paragraph_idx, self.sentence_idx)
                direction, mode = cmd.split('_')
                new_pos = self._advance_position(current_pos, mode) if direction == 'next' else self._rewind_position(current_pos, mode)
                if new_pos:
                    self.chapter_idx, self.paragraph_idx, self.sentence_idx = new_pos
                    self.ui_chapter_idx, self.ui_paragraph_idx, self.ui_sentence_idx = new_pos
                    self._save_extended_progress(sync_audio_position=True)
                    more_navigation_pending = any(
                        isinstance(c, str) and ('next' in c or 'prev' in c)
                        for c in self.pending_commands
                    )
                    if not more_navigation_pending:
                        self.pending_restart_task = asyncio.create_task(self._restart_audio_after_navigation())
                        await self.broadcast({"type": "clear_queue"})
            elif isinstance(cmd, tuple):
                command_name, data = cmd
                if command_name == '_new_sentence_started':
                    if len(data) == 5:
                        c, p, s, duration, timing_data = data
                        audio_file = None
                        generation = None
                    elif len(data) == 6:
                        c, p, s, duration, timing_data, audio_file = data
                        generation = None
                    else:
                        c, p, s, duration, timing_data, audio_file, generation = data
                    if generation is not None and generation != self.audio_generation:
                        continue
                    self.chapter_idx, self.paragraph_idx, self.sentence_idx = c, p, s
                    self.ui_chapter_idx, self.ui_paragraph_idx, self.ui_sentence_idx = c, p, s
                    
                    if isinstance(timing_data, dict):
                        timing_info = timing_data
                    else:
                        timing_info = {"word_timings": timing_data, "speech_duration": duration, "total_duration": duration}
                    
                    sentences = content_parser.split_into_sentences(self.chapters[c][p])
                    current_text = sentences[s]
                    self.current_sentence_words = [token for token in current_text.split() if __import__('re').search(r'[a-zA-Z0-9]', token)]
                    self.current_sentence_duration = timing_info.get("speech_duration") or duration
                    self.current_word_start_time = self.loop.time()
                    
                    import urllib.parse
                    import time
                    audio_url = f"/audio/{os.path.basename(audio_file)}?t={int(time.time() * 1000)}" if audio_file else ""
                    
                    # Let's send the sentence to the frontend
                    await self.broadcast({
                        "type": "new_sentence",
                        "c": c, "p": p, "s": s,
                        "text": current_text,
                        "duration": duration,
                        "timing": timing_info,
                        "words": self.current_sentence_words,
                        "audio_url": audio_url
                    })
                elif command_name == 'seek':
                    c, p, s = data
                    self.chapter_idx, self.paragraph_idx, self.sentence_idx = c, p, s
                    self.ui_chapter_idx, self.ui_paragraph_idx, self.ui_sentence_idx = c, p, s
                    self._save_extended_progress(sync_audio_position=True)
                    self.pending_restart_task = asyncio.create_task(self._restart_audio_after_navigation())
                    await self.broadcast({"type": "clear_queue"})
                    
        await self._shutdown()

    def get_chapter_sentences(self, c):
        chapter_sentences = []
        if c >= len(self.chapters): return []
        for p_idx, para in enumerate(self.chapters[c]):
            sents = content_parser.split_into_sentences(para)
            for s_idx, text in enumerate(sents):
                words = [token for token in text.split() if __import__('re').search(r'[a-zA-Z0-9]', token)]
                chapter_sentences.append({
                    "c": c,
                    "p": p_idx,
                    "s": s_idx,
                    "text": text,
                    "words": words
                })
        return chapter_sentences

@app.get("/api/recent_books")
async def get_recent_books():
    books = progress_manager.get_recent_books(20)
    return {"books": books}

@app.post("/api/upload")
async def upload_book(file: UploadFile = File(...)):
    # Save the file to user data dir
    import os
    upload_dir = os.path.join(config.PROGRESS_FILE_DIR, "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"message": "Upload successful", "path": file_path}

@app.post("/api/update_metadata")
async def update_metadata(request: Request):
    data = await request.json()
    path = data.get("path")
    title = data.get("title")
    author = data.get("author")
    voice = data.get("voice")
    
    success = progress_manager.update_book_metadata(path, title, author, voice)
    return {"success": success}

@app.post("/api/delete_book")
async def delete_book(request: Request):
    data = await request.json()
    path = data.get("path")
    success = progress_manager.delete_book(path)
    return {"success": success}

@app.post("/api/open")
async def open_book(request: Request):
    global active_reader
    data = await request.json()
    file_path = data.get("path")
    
    if active_reader:
        active_reader.running = False
        active_reader.loop.call_soon_threadsafe(active_reader._post_command_sync, 'quit')
        await asyncio.sleep(0.5) # Wait for it to shutdown
        
    tts_manager = TTSManager()
    from rich.console import Console
    console = Console()
    
    # Check for saved voice in progress file
    progress_file = progress_manager.get_progress_file_path(os.path.splitext(os.path.basename(file_path))[0])
    saved_voice = None
    if os.path.exists(progress_file):
        try:
            with open(progress_file, 'r', encoding='utf-8') as f:
                p_data = json.load(f)
                saved_voice = p_data.get("tts_voice")
        except:
            pass
            
    # Default to edge if no saved voice, or use saved voice
    model_name = "edge"
    voice = saved_voice if saved_voice else config.TTS_VOICES.get(model_name)
    tts_instance = tts_manager.create_model(model_name, console, voice=voice)
    
    try:
        active_reader = WebLue(file_path, tts_instance, config.OVERLAP_SECONDS)
        await active_reader.initialize_tts()
        active_reader._initialize_progress()
    except Exception as e:
        logging.error(f"Failed to open book {file_path}: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))

    # Run the reader loop
    asyncio.create_task(active_reader.run())

    # Send book info
    return {
        "title": active_reader.book_title,
        "author": active_reader.book_author,
        "chapters": len(active_reader.chapters),
        "chapter_titles": active_reader.chapter_titles,
        "cover_url": progress_manager.get_book_cover_url(file_path)
    }

@app.get("/api/book_info")
async def book_info():
    if not active_reader:
        return {"error": "No active book"}
    return {
        "title": active_reader.book_title,
        "author": active_reader.book_author,
        "chapters": len(active_reader.chapters),
        "chapter_titles": active_reader.chapter_titles,
        "total_sentences": active_reader.total_sentences,
        "cover_url": progress_manager.get_book_cover_url(active_reader.file_path),
        "current_position": {
            "c": active_reader.chapter_idx,
            "p": active_reader.paragraph_idx,
            "s": active_reader.sentence_idx
        }
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    if active_reader:
        active_reader.websockets.append(websocket)
        if active_reader.last_sentence_msg:
            await websocket.send_json(active_reader.last_sentence_msg)
    active_connections.append(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            if active_reader:
                cmd = data.get("command")
                if cmd == "pause":
                    active_reader.loop.call_soon_threadsafe(active_reader._post_command_sync, 'pause')
                elif cmd == "seek":
                    active_reader.loop.call_soon_threadsafe(active_reader._post_command_sync, ('seek', (data["c"], data["p"], data["s"])))
                elif cmd == "next_sentence":
                    active_reader.loop.call_soon_threadsafe(active_reader._post_command_sync, 'next_sentence')
                elif cmd == "prev_sentence":
                    active_reader.loop.call_soon_threadsafe(active_reader._post_command_sync, 'prev_sentence')
                elif cmd == "next_chapter":
                    active_reader.loop.call_soon_threadsafe(active_reader._post_command_sync, 'next_chapter')
                elif cmd == "prev_chapter":
                    active_reader.loop.call_soon_threadsafe(active_reader._post_command_sync, 'prev_chapter')
                elif cmd == "goto_chapter":
                    c = data["c"]
                    # Check for saved progress for this chapter
                    prog = progress_manager.load_extended_progress(active_reader.progress_file)
                    ch_prog = prog.get("chapter_progress", {})
                    p, s = 0, 0
                    if str(c) in ch_prog:
                        p, s = ch_prog[str(c)]
                    
                    active_reader.loop.call_soon_threadsafe(active_reader._post_command_sync, ('seek', (c, p, s)))
                elif cmd == "get_current_context":
                    c = active_reader.chapter_idx
                    chapter_data = active_reader.get_chapter_sentences(c)
                    await websocket.send_json({
                        "type": "chapter_data",
                        "c": c,
                        "sentences": chapter_data,
                        "current_p": active_reader.paragraph_idx,
                        "current_s": active_reader.sentence_idx
                    })
    except WebSocketDisconnect:
        active_connections.remove(websocket)
        if active_reader and websocket in active_reader.websockets:
            active_reader.websockets.remove(websocket)

@app.get("/audio/{buffer_filename}")
async def get_audio(buffer_filename: str):
    import os
    audio_path = os.path.join(config.AUDIO_DATA_DIR, buffer_filename)
    if os.path.exists(audio_path):
        return FileResponse(audio_path)
    return {"error": "File not found"}

@app.get("/api/cover/{filename}")
async def get_cover(filename: str):
    cover_path = os.path.join(config.PROGRESS_FILE_DIR, "covers", filename)
    if os.path.exists(cover_path):
        return FileResponse(cover_path)
    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail="Cover not found")

# We need to serve the built react app
import pathlib
static_path = pathlib.Path(__file__).parent.parent / "lyricflow-ebook-reader" / "dist"
if static_path.exists():
    app.mount("/", StaticFiles(directory=str(static_path), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
