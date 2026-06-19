from bs4 import BeautifulSoup
import requests
import json

with open("_urls.json") as urls_file:
  urls = json.load(urls_file)
  result = []
  for url in urls:
    tld = url.replace("https://www.iana.org/domains/root/db/", "").replace(".html", "")
    whois = ""
    rdap = ""

    page = requests.get(url)

    soup = BeautifulSoup(page.content, 'html.parser')

    bes = soup.find_all('b')

    for b in bes:
      sbl = b.next_sibling
      if "whois." in sbl: 
        whois = sbl.strip()
      if "rdap." in sbl:
        rdap = sbl.strip()
    with open(f"servers/{tld}.json", "w") as f:
      json.dump({
        "tld": tld,
        "whois": whois,
        "rdap": rdap
      }, f)