import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from check_price import extract_price_from_html, update_document


class PriceCheckerTests(unittest.TestCase):
    def html(self, condition='Premium', sim='Physical SIM + eSIM', colour='White', price='419.00'):
        return f'''<html><head><script>Premium £125.00</script></head><body>
          <h1>iPhone 16e White • 128 GB • Physical SIM + eSIM</h1>
          <section>Select condition: Fair £290.00 Good £360.00 Excellent £405.00 Premium £399.00</section>
          <aside>Other offers: iPhone 16 £299.00</aside>
          <section>iPhone 16e <ul><li>{condition}</li><li>128 GB</li>
          <li>{sim}</li><li>{colour}</li></ul><b>£{price}</b> before trade-in</section>
          <footer>£599 new</footer></body></html>'''

    def test_exact_variant(self):
        self.assertEqual(extract_price_from_html(self.html()), 419.00)

    def test_ignore_condition_picker_price(self):
        self.assertEqual(extract_price_from_html(self.html(price='423.50')), 423.50)

    def test_reject_esim_only(self):
        with self.assertRaises(ValueError):
            extract_price_from_html(self.html(sim='eSIM'))

    def test_reject_wrong_colour(self):
        with self.assertRaises(ValueError):
            extract_price_from_html(self.html(colour='Black'))

    def test_reject_wrong_condition(self):
        with self.assertRaises(ValueError):
            extract_price_from_html(self.html(condition='Excellent'))

    def test_reject_scripts_with_fake_price(self):
        with self.assertRaises(ValueError):
            extract_price_from_html('<html><script>iPhone 16e Premium 128 GB Physical SIM + eSIM White £199.00</script><body>Other device £399</body></html>')

    def test_history_when_price_changes_and_no_repeats_for_hourly_check(self):
        existing={'history':[{'at':'2026-10-22T18:00:00Z','price':419.0,'source':'automatic'}]}
        changed=update_document(existing,405.0,'2026-10-22T19:00:00Z')
        self.assertEqual(len(changed['history']),2)
        unchanged=update_document(changed,405.0,'2026-10-22T20:00:00Z')
        self.assertEqual(len(unchanged['history']),2)


if __name__ == '__main__':unittest.main()
