import requests
from bs4 import BeautifulSoup
import os

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
})

problematic = {
    "the-mirror": "https://film-grab.com/2010/09/27/mirror-%d0%b7%d0%b5%d1%80%d0%ba%d0%b0%d0%bb%d0%be-zerkalo/",
    "solaris": "https://film-grab.com/2012/12/14/solaris-2/",
    "drive": "https://film-grab.com/2012/03/12/drive/",
    "spirited-away": "https://film-grab.com/2013/05/20/spirited-away/"
}

def fix_missing():
    if not os.path.exists("movie_frames"): os.makedirs("movie_frames")
    
    for name, url in problematic.items():
        print(f"Fixing {name}...")
        try:
            res = session.get(url, timeout=15)
            soup = BeautifulSoup(res.text, 'html.parser')
            img_url = None
            
            # Try to find any high res jpg
            for a in soup.select('a[href*=".jpg"]'):
                if 'uploads' in a['href']:
                    img_url = a['href'].split('?')[0]
                    break
            
            if not img_url:
                for img in soup.select('img'):
                    src = img.get('data-orig-file') or img.get('src')
                    if src and '.jpg' in src.lower() and 'uploads' in src:
                        img_url = src.split('?')[0]
                        break
            
            if img_url:
                with session.get(img_url, stream=True) as r:
                    r.raise_for_status()
                    with open(f"movie_frames/{name}.jpg", 'wb') as f:
                        for chunk in r.iter_content(1024): f.write(chunk)
                print(f"  Fixed: {name}.jpg")
            else:
                print(f"  Still failed for {name}")
        except Exception as e:
            print(f"  Error on {name}: {e}")

if __name__ == "__main__":
    fix_missing()
