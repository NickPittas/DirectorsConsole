import requests
import os

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
})

manual_links = {
    "the-mirror": "https://framerated.co.uk/wp-content/uploads/2021/07/mirror-1975-01.jpg",
    "solaris": "https://m.media-amazon.com/images/M/MV5BMTEyNTQwMTctMmQ0ZC00MjliLTg4MTgtMTA3MmQ3Y2ZiN2Q5XkEyXkFqcGdeQXVyMTAwMzUyOTc@._V1_.jpg",
    "drive": "https://m.media-amazon.com/images/M/MV5BNzYyNzU1NzctMTg3OS00YjA2LTkxYjktMDI0M2VlMDIzMDM2XkEyXkFqcGdeQXVyMTAwMzUyOTc@._V1_.jpg",
    "spirited-away": "https://m.media-amazon.com/images/M/MV5BMjlmZmI5MDctNDE2YS00YWE0LWE5ZWMyMzVlOTQyNDg1ODgxXkEyXkFqcGdeQXVyMTAwMzUyOTc@._V1_.jpg"
}

def finalize():
    for name, url in manual_links.items():
        try:
            res = session.get(url, stream=True, timeout=20)
            res.raise_for_status()
            with open(f"movie_frames/{name}.jpg", 'wb') as f:
                for chunk in res.iter_content(1024): f.write(chunk)
            print(f"Downloaded {name}.jpg")
        except Exception as e:
            print(f"Failed {name}: {e}")

if __name__ == "__main__":
    finalize()
