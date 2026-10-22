# My iPhone Fund — iPhone 16e savings and price tracker

A personal savings website for the **iPhone 16e · White · 128 GB · Premium condition · Physical SIM + eSIM** from Back Market UK.

**Starting savings: £113.00**  
**Reference handset price: £419.00, checked 22 October 2026**  
**Estimated Quality Assurance Fee: £0.49 (starting fee, not a guarantee)**

The homepage shows a progress ring, amount saved, amount remaining (including your fee estimate), estimated completion date, price-change chart, and savings diary. You can add/withdraw money, change starting savings, set a weekly savings rate, record a fallback price, and back up or restore your savings.

## Easiest free hosting: GitHub Pages

GitHub Pages hosts the website and **GitHub Actions checks Back Market approximately every hour** and redeploys the price history. The checker refuses prices that do not explicitly match the selected product's Premium / white / 128 GB / physical SIM + eSIM summary.

1. Sign in to [GitHub](https://github.com/) and choose **New repository**.
2. Call it `iphone-16e-savings`; select **Public**; do not add a starter README.
3. **Unzip** the supplied project ZIP on your computer. On your repository's **Add file → Upload files** page, upload the unzipped **contents**, keeping these folders and files in the root (including the `.github/workflows` folder):
   - `index.html`, `styles.css`, `app.js`, `favicon.svg`, `README.md`
   - `data/price.json`
   - `scripts/check_price.py`
   - `.github/workflows/price-and-pages.yml`
   - `tests/test_price_checker.py` (optional; included for code checks)
4. Click **Commit changes** to your `main` branch.
5. Open your repo's **Settings → Pages**, and under **Build and deployment**, set **Source = GitHub Actions**.
6. Open the **Actions** tab, select **Check exact iPhone price and publish website**, click **Run workflow** (choose `main`). If GitHub asks, enable actions for the repository first.
7. Once the workflow's deployment succeeds, your site URL will be `https://YOUR-USERNAME.github.io/iphone-16e-savings/`. You can find the exact URL under **Settings → Pages → Visit site**.

If the action fails with a push/permission error, open **Settings → Actions → General**, scroll to **Workflow permissions**, and enable **Read and write permissions** if your account allows it. Retry from **Actions**.

### How the automatic price updates work

- Every hour at approximately minute 17 UTC, GitHub Actions requests the specific `?l=9` Back Market product page.
- It only records a new price if the page clearly identifies **iPhone 16e / Premium / 128 GB / Physical SIM + eSIM / White** in the *selected product summary*, followed by the offer price.
- The updated price and dated history are stored in `data/price.json`. The website is then redeployed to GitHub Pages.
- While you have the website open, it refreshes its published price data every five minutes, and whenever you return to the tab. The **Refresh displayed price** button reloads the already-published price file; it does not force Back Market to check immediately. You can run **Run workflow** on GitHub to force a fresh server-side check.
- GitHub's scheduled tasks can be late and Back Market may change its site or block automated fetches. If so, the latest check is marked **unavailable** and the dashboard preserves the prior verified price or the 22 October reference. It does **not** pretend this price is live. Double-check the listing before buying.
- **The reference is £419.00**; *not* a claim that the price will still be £419 when you open the site later.
- You can set a **fallback price** under Settings if automation is unavailable. Manual values are labelled separately. The initial fee is an estimate; update it to match actual checkout fees.
- If GitHub's scheduled action has not worked for a long time, visit the **Actions** tab to re-enable or run it. GitHub may disable scheduled workflows for an inactive public repository after 60 days.

### Your savings privacy

Savings amounts and transactions are **stored in this browser on this device**, not in GitHub, and are not visible to others visiting the same public website. They will not sync between phones/computers. Clearing browser data may erase them. Use the **Export backup** option, and **Import backup** on another device to transfer savings.

No Back Market account login is needed. The website never attempts to make purchases and never stores payment information.

### Preview on your computer

Unzip the project and double-click `index.html`. The dashboard should display the 22 October reference price, and the savings features work in browsers that allow local storage for local files. A local file may not be allowed to load `data/price.json` through JavaScript because of browser security restrictions; for automatic checks, publish to GitHub Pages as above.

### Test price-parsing safeguards

```bash
python -m unittest discover -s tests -v
```

## Files

- `index.html` — dashboard layout, dialogs, links
- `styles.css` — visual design and mobile layout
- `app.js` — savings calculation, local storage, chart, backup
- `data/price.json` — shared published price/history/status
- `scripts/check_price.py` — verifies the exact merchant configuration before changing price
- `.github/workflows/price-and-pages.yml` — automatic hourly checks, data commits and Pages deployment
- `tests/test_price_checker.py` — tests for exact variant matching and wrong variant rejection

*Not associated with Apple or Back Market. Information is provided for personal price tracking, not guaranteed checkout pricing.*
