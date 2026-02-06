import os
import requests
import time
import re
import random
import json
from bs4 import BeautifulSoup

# List of movies to download frames for
movies = [
    "The Godfather (1972)", "Citizen Kane (1941)", "Apocalypse Now (1979)", "2001: A Space Odyssey (1968)",
    "Taxi Driver (1976)", "Seven Samurai (1954)", "Vertigo (1958)", "Lawrence of Arabia (1962)",
    "Pulp Fiction (1994)", "The Shawshank Redemption (1994)", "No Country for Old Men (2007)",
    "Children of Men (2006)", "The Matrix (1999)", "In the Mood for Love (2000)", "Rashomon (1950)",
    "Star Wars: A New Hope (1977)", "Schindler’s List (1993)", "The Dark Knight (2008)", "Parasite (2019)",
    "Mad Max: Fury Road (2015)", "Metropolis (1927)", "THE SEVENTH SEAL (1957)", "AMÉLIE (2001)",
    "There Will Be Blood (2007)", "HER (2013)", "Blade Runner (1982)", "Casablanca (1942)",
    "Mulholland Drive (2001)", "Double Indemnity (1944)", "The Maltese Falcon (1941)", "Sunset Boulevard (1950)",
    "Bicycle Thieves (1948)", "La Dolce Vita (1960)", "Breathless (1960)", "Jules et Jim (1962)",
    "Tokyo Story (1953)", "Harakiri (1962)", "Andalusian Dog (1929)", "Stalker (1979)", "The Mirror (1975)",
    "Alien (1979)", "Solaris (1972)", "The French Connection (1971)", "One Flew Over the Cuckoo's Nest (1975)",
    "Drive (2011)", "The Lighthouse (2019)", "Under the Skin (2013)", "Akira (1988)", "Ghost in the Shell (1995)",
    "Spirited Away (2001)", "Chinatown (1974)", "Blue Velvet (1986)", "Eyes Wide Shut (1999)",
    "Barry Lyndon (1975)", "The Tree of Life (2011)", "Roma (2018)", "The Grand Budapest Hotel (2014)",
    "Oldboy (2003)", "Memories of Murder (2003)", "The Battle of Algiers (1966)", "Come and See (1985)",
    "Persona (1966)", "La Haine (1995)", "Requiem for a Dream (2000)", "Enter the Void (2009)",
    "Moonlight (2016)", "A Clockwork Orange (1971)", "Brazil (1985)", "Heat (1995)", "The Thin Red Line (1998)"
]

SAVE_DIR = "movie_frames"

# Headers for scraping
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
}

session = requests.Session()
session.headers.update(HEADERS)

def normalize_name(name):
    # Remove year in parentheses
    name = re.sub(r'\(.*?\)', '', name).strip()
    name = name.lower()
    name = re.sub(r'[^a-z0-9\s-]', '', name)
    name = re.sub(r'[\s-]+', '-', name)
    return name.strip('-')

def download_image(url, filepath):
    try:
        response = session.get(url, stream=True, timeout=15)
        if response.status_code == 200:
            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(1024):
                    f.write(chunk)
            return True
    except Exception as e:
        print(f"    Error downloading {url}: {e}")
    return False

def get_from_bing(movie_title):
    print(f"  Trying Bing Images...")
    search_term = f"{movie_title} iconic movie frame still -poster"
    url = f"https://www.bing.com/images/search?q={search_term.replace(' ', '+')}&form=HDRSC2&first=1"
    
    try:
        res = session.get(url, timeout=10)
        soup = BeautifulSoup(res.text, 'html.parser')
        iusc_tags = soup.select('a.iusc')
        for tag in iusc_tags:
            m_data = json.loads(tag.get('m'))
            img_url = m_data.get('murl')
            if img_url and ('.jpg' in img_url.lower() or '.png' in img_url.lower()):
                if 'poster' not in img_url.lower() and 'stock' not in img_url.lower():
                    return img_url
    except Exception as e:
        print(f"    Bing failed: {e}")
    return None

def get_from_filmgrab(movie_title):
    print(f"  Trying FilmGrab...")
    clean_title = re.sub(r'\(.*?\)', '', movie_title).strip()
    search_url = f"https://film-grab.com/?s={clean_title.replace(' ', '+')}"
    
    try:
        res = session.get(search_url, timeout=15)
        if res.status_code != 200: return None
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # Find first result
        link = soup.select_one('h2.entry-title a, article h2 a, .entry-title a')
        if not link: return None
        
        res = session.get(link['href'], timeout=15)
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # Find first gallery image
        for a in soup.select('a[href*=".jpg"]'):
            href = a['href']
            if 'uploads/photo-gallery' in href:
                return href.split('?')[0]
                
        for img in soup.select('img'):
            src = img.get('data-orig-file') or img.get('src')
            if src and 'photo-gallery' in src and '.jpg' in src.lower():
                return src.split('?')[0]
    except:
        pass
    return None

def get_frame(movie_title):
    normalized = normalize_name(movie_title)
    filepath = os.path.join(SAVE_DIR, f"{normalized}.jpg")

    if os.path.exists(filepath):
        print(f"Skipping {movie_title}, already exists.")
        return

    print(f"Processing: {movie_title}...")
    
    # Strategy 1: FilmGrab (Better quality)
    img_url = get_from_filmgrab(movie_title)
    
    # Strategy 2: Bing (More reliable)
    if not img_url:
        img_url = get_from_bing(movie_title)

    if img_url:
        if download_image(img_url, filepath):
            print(f"  Successfully saved -> {filepath}")
        else:
            print(f"  Failed download attempt. Trying Bing fallback...")
            img_url = get_from_bing(movie_title)
            if img_url and download_image(img_url, filepath):
                print(f"  Successfully saved -> {filepath}")
            else:
                print(f"  !!! Could not download for {movie_title}")
    else:
        print(f"  !!! Could not find image for {movie_title}")

if __name__ == "__main__":
    if not os.path.exists(SAVE_DIR):
        os.makedirs(SAVE_DIR)
        
    for movie in movies:
        get_frame(movie)
        time.sleep(1.5 + random.random())

    print("\n--- Download Process Completed ---")
