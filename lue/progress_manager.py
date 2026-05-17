"""Reading progress management for the Lue eBook reader."""

import os
import json
import re
import glob
import logging
from . import config


def get_progress_file_path(book_title):
    """
    Generate the file path for storing reading progress.
    
    Args:
        book_title: Title of the book
        
    Returns:
        str: Full path to the progress file
    """
    safe_title = re.sub(r'[^A-Za-z0-9]+', '', book_title)
    return os.path.join(config.PROGRESS_FILE_DIR, f"{safe_title}.progress.json")

def load_progress(progress_file):
    """
    Load basic reading progress from file.
    
    Args:
        progress_file: Path to the progress file
        
    Returns:
        tuple: (chapter_idx, paragraph_idx, sentence_idx)
    """
    if os.path.exists(progress_file):
        with open(progress_file, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
                return data.get("c", 0), data.get("p", 0), data.get("s", 0)
            except json.JSONDecodeError:
                return 0, 0, 0
    return 0, 0, 0

def load_extended_progress(progress_file):
    """
    Load extended reading progress including UI state.
    
    Args:
        progress_file: Path to the progress file
        
    Returns:
        dict: Progress data with reading position and UI state
    """
    default_progress = {
        "c": 0, "p": 0, "s": 0,
        "scroll_offset": 0,
        "tts_enabled": True,
        "auto_scroll_enabled": True,
        "manual_scroll_anchor": None,
        "playback_speed": 1.0
    }
    
    if not os.path.exists(progress_file):
        return default_progress
        
    try:
        with open(progress_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return {
                "c": data.get("c", 0),
                "p": data.get("p", 0), 
                "s": data.get("s", 0),
                "scroll_offset": data.get("scroll_offset", 0),
                "tts_enabled": data.get("tts_enabled", True),
                "auto_scroll_enabled": data.get("auto_scroll_enabled", True),
                "manual_scroll_anchor": data.get("manual_scroll_anchor", None),
                "playback_speed": data.get("playback_speed", 1.0),
                "chapter_progress": data.get("chapter_progress", {})
            }
    except (json.JSONDecodeError, IOError):
        return default_progress

def save_progress(progress_file, chapter_idx, paragraph_idx, sentence_idx):
    """
    Save basic reading progress to file.
    
    Args:
        progress_file: Path to the progress file
        chapter_idx: Current chapter index
        paragraph_idx: Current paragraph index
        sentence_idx: Current sentence index
    """
    # Load existing to preserve chapter_progress if any
    try:
        with open(progress_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except:
        data = {}
        
    data["c"] = chapter_idx
    data["p"] = paragraph_idx
    data["s"] = sentence_idx
    
    # Update chapter_progress
    if "chapter_progress" not in data:
        data["chapter_progress"] = {}
    data["chapter_progress"][str(chapter_idx)] = [paragraph_idx, sentence_idx]
    
    with open(progress_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

def save_extended_progress(progress_file, chapter_idx, paragraph_idx, sentence_idx, 
                          scroll_offset, tts_enabled, auto_scroll_enabled, manual_scroll_anchor=None, original_file_path=None, playback_speed=1.0, percentage=0.0, total_chapters=1):
    """
    Save extended reading progress including UI state.
    """
    # Load existing to preserve custom metadata and chapter_progress
    try:
        if os.path.exists(progress_file):
            with open(progress_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
        else:
            data = {}
    except Exception as e:
        logging.warning(f"[PROGRESS] Failed to load existing progress for save: {e}")
        data = {}

    # Update progress-related fields
    data.update({
        "c": chapter_idx,
        "p": paragraph_idx, 
        "s": sentence_idx,
        "scroll_offset": float(scroll_offset),
        "tts_enabled": bool(tts_enabled),
        "auto_scroll_enabled": bool(auto_scroll_enabled),
        "playback_speed": float(playback_speed),
        "completion_percentage": float(percentage),
        "total_chapters": int(total_chapters)
    })
    
    # Update chapter_progress
    if "chapter_progress" not in data:
        data["chapter_progress"] = {}
    
    data["chapter_progress"][str(chapter_idx)] = [paragraph_idx, sentence_idx]

    if manual_scroll_anchor:
        data["manual_scroll_anchor"] = manual_scroll_anchor
    if original_file_path:
        data["original_file_path"] = original_file_path
        
    try:
        with open(progress_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        logging.debug(f"[PROGRESS] Saved position to {progress_file}, keys present: {list(data.keys())}")
    except Exception as e:
        logging.error(f"[PROGRESS] Failed to save progress: {e}")

def get_recent_books(limit=5):
    """
    Get a list of recently read books.
    
    Args:
        limit: Maximum number of books to return
        
    Returns:
        list: List of dicts containing title, path, and percentage
    """
    progress_files = glob.glob(os.path.join(config.PROGRESS_FILE_DIR, "*.progress.json"))
    
    # Sort by modification time (newest first)
    progress_files.sort(key=os.path.getmtime, reverse=True)
    
    recent_books = []
    for pf in progress_files:
        if len(recent_books) >= limit:
            break
            
        try:
            with open(pf, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            original_path = data.get("original_file_path")
            if not original_path or not os.path.exists(original_path):
                continue
                
            # Extract rich metadata
            from . import content_parser
            metadata = content_parser.extract_metadata(original_path)
            # Prioritize custom metadata if it exists in the progress file
            title = data.get("custom_title", metadata["title"])
            author = data.get("custom_author", metadata["author"])
            voice = data.get("tts_voice", config.TTS_VOICES.get("edge"))
            
            percentage = data.get("completion_percentage", 0.0)
            current_c = data.get("c", 0)
            total_chapters = data.get("total_chapters", 1)
            
            recent_books.append({
                "title": title,
                "author": author,
                "voice": voice,
                "path": original_path,
                "percentage": percentage,
                "current_c": current_c,
                "total_chapters": total_chapters
            })
            
        except (json.JSONDecodeError, IOError):
            continue
            
    return recent_books

def update_book_metadata(original_path, title=None, author=None, voice=None):
    """Update custom metadata for a book in its progress file."""
    book_filename = os.path.splitext(os.path.basename(original_path))[0]
    progress_file = get_progress_file_path(book_filename)
    logging.info(f"[METADATA] Updating {book_filename} - Title: {title}, Author: {author}, Voice: {voice}")
    
    try:
        if os.path.exists(progress_file):
            with open(progress_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            logging.info(f"[METADATA] Found existing progress file, keys: {list(data.keys())}")
        else:
            data = {"original_file_path": original_path}
            logging.info(f"[METADATA] Creating new progress file")
            
        if title: data["custom_title"] = title
        if author: data["custom_author"] = author
        if voice: data["tts_voice"] = voice
        
        with open(progress_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        logging.info(f"[METADATA] Successfully saved custom metadata to {progress_file}")
        return True
    except Exception as e:
        logging.error(f"[METADATA] Failed to update book metadata: {e}")
        return False

def delete_book(original_path):
    """Delete a book's progress file and its uploaded file if it exists."""
    progress_file = get_progress_file_path(os.path.splitext(os.path.basename(original_path))[0])
    try:
        # Delete progress file
        if os.path.exists(progress_file):
            os.remove(progress_file)
            
        # If the file is in the uploads directory, delete it too
        if "uploads" in original_path and os.path.exists(original_path):
            os.remove(original_path)
            
        return True
    except Exception as e:
        logging.error(f"Failed to delete book: {e}")
        return False

def validate_and_set_progress(chapters, progress_file, c, p, s):
    """
    Validate reading progress against document structure.
    
    Args:
        chapters: Document chapters structure
        progress_file: Path to progress file (for cleanup if invalid)
        c: Chapter index to validate
        p: Paragraph index to validate
        s: Sentence index to validate
        
    Returns:
        tuple: Valid (chapter_idx, paragraph_idx, sentence_idx)
    """
    try:
        paragraph = chapters[c][p]
        sentences = re.split(r'(?<=[.!?])\s+', paragraph)
        _ = sentences[s]  # Test if sentence exists
        return c, p, s
    except IndexError:
        # Invalid progress, reset to beginning
        if os.path.exists(progress_file):
            os.remove(progress_file)
        return 0, 0, 0

def find_most_recent_book():
    """
    Find the most recently updated progress file and return the original file path.
    
    Returns:
        str or None: Path to the most recently read book, or None if no books found
    """
    progress_files = glob.glob(os.path.join(config.PROGRESS_FILE_DIR, "*.progress.json"))
    
    if not progress_files:
        return None
    
    # Find the most recently modified progress file
    most_recent_file = max(progress_files, key=os.path.getmtime)
    
    try:
        with open(most_recent_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            original_path = data.get("original_file_path")
            
            # Check if the original file still exists
            if original_path and os.path.exists(original_path):
                return original_path
                
    except (json.JSONDecodeError, IOError):
        pass
    
    return None