#!/usr/bin/env python3
"""Check the exact Back Market SKU. Fail closed if Premium + SIM cannot be verified.

Runs in GitHub Actions; uses only Python standard library. It never treats the
condition-selector price as the price of the actually selected SKU.
"""
import html
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DATA_PATH = Path(__file__).resolve().parent.parent / 'data' / 'price.json'
PRODUCT_URL = (
    'https://www.backmarket.co.uk/en-gb/p/'
    'iphone-16e-128-gb-white-unlocked/'
    '16f80332-3350-4310-88e8-727c7cfc715a'
    '?l=9&closestPickerConfig=true&pickerClicked=true'
)
# Accept ONLY the selected product summary, in its exact attribute order.
# Ignore generic "Premium £xxx" condition-picker quotes, which may differ.
VARIANT = re.compile(
    r'\biPhone\s*16e\s*'
    r'(?:[-*•]\s*)?Premium\s*'
    r'(?:[-*•]\s*)?(?:(?:Standard|New)\s+battery\s*)?'
    r'(?:[-*•]\s*)?128\s*GB\s*'
    r'(?:[-*•]\s*)?Physical\s*SIM\s*\+\s*eSIM\s*'
    r'(?:[-*•]\s*)?White\s*'
    r'£\s*([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\b',
    re.IGNORECASE,
)


class VisibleText(HTMLParser):
    """Extract visible-like HTML text; avoid pricing from JSON, scripts or SVG."""
    IGNORE = {'script', 'style', 'noscript', 'svg', 'template', 'head'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocked = []
        self.text = []

    def handle_starttag(self, tag, attrs):
        if tag in self.IGNORE:
            self.blocked.append(tag)

    def handle_endtag(self, tag):
        if tag in self.blocked:
            # HTML is sometimes malformed, so remove only the matching nesting.
            self.blocked = self.blocked[:len(self.blocked) - 1 - self.blocked[::-1].index(tag)]

    def handle_data(self, data):
        if not self.blocked and data.strip():
            self.text.append(data)


def extract_price_from_html(document):
    if not isinstance(document, str) or len(document) < 60:
        raise ValueError('Back Market returned no readable page')
    reader = VisibleText()
    reader.feed(document)
    visible = re.sub(r'\s+', ' ', html.unescape(' '.join(reader.text)).replace('\u200b', '')).strip()
    matches = VARIANT.findall(visible)
    prices = {round(float(value.replace(',', '')), 2) for value in matches}
    if not prices:
        raise ValueError('Could not verify selected Premium / 128 GB / white / physical SIM combination')
    if len(prices) > 1:
        raise ValueError('Conflicting prices for the selected product summary: ' + str(sorted(prices)))
    result = prices.pop()
    if not 100 <= result <= 1500:
        raise ValueError('Unusually low/high price; refusing to use unverified amount')
    return result


def obtain_page():
    request = Request(PRODUCT_URL, headers={
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.8',
    })
    with urlopen(request, timeout=28) as response:
        content_type = response.headers.get('Content-Type', '')
        if 'text/html' not in content_type:
            raise ValueError(f'Unexpected content type: {content_type}')
        content = response.read(5_000_001)
        if len(content) > 5_000_000:
            raise ValueError('Page too large to parse safely')
        return content.decode('utf-8', errors='replace')


def update_document(current, price, checked_at):
    item = dict(current)
    previous_history = list(item.get('history') or [])
    entry = {'at': checked_at, 'price': price, 'source': 'automatic'}
    # Preserve chart detail whenever price changes; add daily points when unchanged.
    last = previous_history[-1] if previous_history else None
    last_time = datetime.fromisoformat(str(last.get('at')).replace('Z', '+00:00')) if last else None
    if last_time and last_time.tzinfo is None:
        last_time = last_time.replace(tzinfo=timezone.utc)
    if not last or round(float(last['price']), 2) != price or last_time < datetime.fromisoformat(checked_at.replace('Z', '+00:00')) - timedelta(hours=24):
        previous_history.append(entry)
    item.update({
        'price': price,
        'checkedAt': checked_at,
        'lastSuccessAt': checked_at,
        'status': 'ok',
        'error': None,
        'history': previous_history[-750:],
    })
    return item


def run():
    data = json.loads(DATA_PATH.read_text(encoding='utf-8'))
    timestamp = datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    try:
        price = extract_price_from_html(obtain_page())
        data = update_document(data, price, timestamp)
        print(f'Exact configuration verified: £{price:.2f} at {timestamp}')
    except (ValueError, HTTPError, URLError, TimeoutError, OSError) as error:
        # Keep the last verified price, record the failure, DO NOT invent a price.
        message = f'{type(error).__name__}: {error}'
        data.update({'status': 'error', 'checkedAt': timestamp, 'error': message[:180]})
        print('Price check unsuccessful:', message, file=sys.stderr)
    DATA_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    return 0  # Even if blocked, deploy the website with a clear error indicator.


if __name__ == '__main__':
    sys.exit(run())
