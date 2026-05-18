from playwright.sync_api import sync_playwright
import sys

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Capture console logs
        page.on("console", lambda msg: print(f"CONSOLE: {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

        try:
            # We assume the user has the server running or we point to the dist/index.html
            # Since we can't easily start the python server and keep it running for playwright here 
            # without more complex setup, let's try to load the file directly first to see if JS fails
            import os
            path = os.path.abspath("lyricflow-ebook-reader/dist/index.html")
            print(f"Loading {path}")
            page.goto(f"file://{path}")
            page.wait_for_load_state("networkidle")
            
            # Take a screenshot to see the "blank" state
            page.screenshot(path="debug_screenshot.png")
            print("Screenshot saved to debug_screenshot.png")
            
            # Check the root element content
            root_content = page.inner_html("#root")
            print(f"Root content length: {len(root_content)}")
            if len(root_content) < 100:
                print("Root content is suspiciously empty.")
                print(f"HTML: {root_content}")

        except Exception as e:
            print(f"Error during playwright execution: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
