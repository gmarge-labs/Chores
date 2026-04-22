# ChoreHeroes — Family Task Tracker

A PWA for families to track kids' chores, earn points, and celebrate together.

## Live
https://choreheroes.app

## Stack
- Vanilla JS + Firebase Auth + Firestore
- GitHub Pages (static hosting)
- Stripe (subscriptions)
- Resend (email)
- Home Assistant (voice announcements)

## Dev
```bash
cd ~/Documents/Playground/Chores
python3 -m http.server 3000
# open http://localhost:3000
```

## Branches
- `main` → production (choreheroes.app)
- `dev` → development

## Tests
Open http://localhost:3000, paste `tests/suite.js` in the browser console.
21 tests across auth, family data, kids, rendering, business logic.

## Pricing
- Tier 1: $4.99/mo — App only
- Tier 2: $9.99/mo — App + Home Assistant voice announcements
