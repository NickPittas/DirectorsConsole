import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1"
}

def debug_search(movie):
    url = f"https://film-grab.com/?s={movie.replace(' ', '+')}"
    print(f"Searching: {url}")
    try:
        res = requests.get(url, headers=HEADERS, timeout=15)
        print(f"Status Code: {res.status_code}")
        print(f"Response Length: {len(res.text)}")
        
        if "cf-browser-verification" in res.text or "Cloudflare" in res.text:
            print("Detected Cloudflare Protection!")
        
        soup = BeautifulSoup(res.text, 'html.parser')
        links = soup.select('a[href*="film-grab.com/2"]')
        print(f"Found {len(links)} links containing 'film-grab.com/2'")
        for i, link in enumerate(links[:5]):
            print(f"  {i+1}: {link.get('href')} - {link.get_text().strip()}")
            
        # Try finding by title
        titles = soup.select('h2')
        print(f"Found {len(titles)} h2 tags")
        for t in titles[:5]:
            print(f"  h2: {t.get_text().strip()}")

    except Exception as e:
        print(f"Error: {e}")

def debug_movie_page(url):
    print(f"Checking page: {url}")
    try:
        res = requests.get(url, headers=HEADERS, timeout=15)
        print(f"Status Code: {res.status_code}")
        soup = BeautifulSoup(res.text, 'html.parser')
        
        links = soup.select('a[href*=".jpg"]')
        print(f"Found {len(links)} links to .jpg")
        for i, link in enumerate(links[:5]):
            print(f"  {i+1}: {link.get('href')}")
            
        imgs = soup.select('img')
        print(f"Found {len(imgs)} imgs")
        for i, img in enumerate(imgs[:5]):
            print(f"  {i+1}: {img.get('src')} | alt: {img.get('alt')}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # debug_search("Citizen Kane")
    # print("-" * 20)
    debug_movie_page("https://film-grab.com/2010/07/27/the-godfather/")
