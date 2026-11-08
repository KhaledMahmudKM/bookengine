## First creating and pushing
```bash
git init
git add README.md
git commit -m "commits"
git branch -M main
git remote add origin https://github.com/KhaledMahmudKM/bookengine.git
git push -u origin main
```
# Then add all the files
```bash
git add *
git commit -m "more commits"
git push -u origin main
```

# Pushing with tag (example for tag 1.0.2)
git add -A
git commit -m "v1.0.6"
git push -u origin main

git tag 1.0.6
git push origin 1.0.6

## Verify it’s live before bumping any book. Wait a couple of minutes, then open:
https://cdn.jsdelivr.net/gh/khaledmahmudkm/bookengine@1.0.6/bookengine.js