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
git commit -m "v1.0.2: title links to preface, logo to stacks"
git push -u origin main

git tag 1.0.2
git push origin 1.0.2
