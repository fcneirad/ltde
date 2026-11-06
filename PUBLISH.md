# Publishing to GitHub Pages

This folder is a self-contained git repo (branch `main`). Everything here is
static, so GitHub Pages just serves it directly — **no build step on GitHub**.

## One-time setup

### 1. Create the empty repo on GitHub
Go to <https://github.com/new> and create a repo named **`ltde`** (or your
preferred name). Leave it **empty** (no README, no .gitignore) and set it to
**Private** for now. Do *not* let GitHub initialize it with files.

### 2. Connect this machine to GitHub (pick ONE)

**Option A — SSH key (recommended)**
```bash
cat ~/.ssh/id_ed25519.pub          # copy the whole line
```
Then on GitHub: **Settings → SSH and GPG keys → New SSH key**, paste it, save.
Test with:
```bash
ssh -T git@github.com              # should say "Hi <you>! You've successfully authenticated"
```

**Option B — Personal Access Token over HTTPS**
Create a token at **Settings → Developer settings → Tokens (fine-grained)** with
*Contents: Read and write* on the `ltde` repo. You'll use it in the remote URL
below (or when git prompts for a password).

### 3. Add the remote and push
```bash
cd LTDE_plots
# Option A (SSH):
git remote add origin git@github.com:<YOUR-USERNAME>/ltde.git
# Option B (HTTPS, token as password when prompted):
git remote add origin https://github.com/<YOUR-USERNAME>/ltde.git

git push -u origin main
```

### 4. Enable GitHub Pages
On the repo page: **Settings → Pages → Build and deployment**
- Source: **Deploy from a branch**
- Branch: `main`, folder: `/ (root)` → **Save**

Within a minute or two your site is live at:
```
https://<YOUR-USERNAME>.github.io/ltde/
```
(Private repos can use Pages on GitHub Pro / Team / Enterprise plans; otherwise
make the repo public — the plots are not sensitive.)

## Updating after changing figures or data

```bash
# 1. re-run the relevant notebook cell(s) in ../paper_plots so the PNGs refresh
# 2. rebuild the site (copies figures + re-exports JSON):
python3 make_site.py
# 3. commit & push:
git add -A && git commit -m "update" && git push
```

## Notes
- `data/scores.json` (~1 MB) and `figures/` (~8 MB) are the bulk of the repo;
  total ~9.5 MB, comfortably within GitHub's limits.
- The playground loads Plotly + KaTeX from a CDN, so viewers need internet
  access. The static gallery works fully offline.
