import requests
import os
import re
import json

SAVE_DIR = "movie_frames"
session = requests.Session()
session.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"})

def get_from_ddg(query):
    print(f"  Trying DDG for: {query}")
    # DuckDuckGo image search params
    url = f"https://duckduckgo.com/i.js?q={query.replace(' ', '+')}&o=json"
    try:
        res = session.get(url, timeout=10)
        data = res.json()
        if 'results' in data:
            for r in data['results']:
                img_url = r.get('image')
                if img_url and any(ext in img_url.lower() for ext in ['.jpg', '.png']):
                    return img_url
    except: pass
    return None

def main():
    missing = ["The Mirror (1975)", "Solaris (1972)", "Drive (2011)", "Spirited Away (2001)"]
    for m in missing:
        normalized = re.sub(r'\(.*?\)', '', m).strip().lower().replace(' ', '-')
        filepath = f"{SAVE_DIR}/{normalized}.jpg"
        if os.path.exists(filepath): continue
        
        print(f"Downloading {m}...")
        url = get_from_ddg(f"{m} movie frame still iconic high resolution")
        if url:
            try:
                r = session.get(url, timeout=20, stream=True)
                if r.status_code == 200:
                    with open(filepath, 'wb') as f:
                        for chunk in r.iter_content(1024): f.write(chunk)
                    print(f"  Saved {filepath}")
                else: print(f"  Fail status {r.status_code}")
            except Exception as e: print(f"  Err: {e}")
        else: print(f"  No url found")

if __name__ == "__main__":
    main()
