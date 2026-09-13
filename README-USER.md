# RestockRadar

RestockRadar keeps an eye on the groceries and household products you buy regularly, learns roughly
how often you reorder each one from your past purchases, and shows you that on one dashboard.

## What it does today

- Shows a summary of your purchase history (how many transactions, over what date range, from how
  many stores).
- Lists any open alerts.
- Shows your watchlist — the products you've asked it to track, and what you told it matters about
  each one.
- Lets you add, edit, or remove watchlist products yourself, any time you change your mind.

## What it doesn't do yet

- It doesn't check live prices at stores yet — today it only learns from your past purchase history.
- It doesn't automatically create alerts yet (deal detection is still being built).
- The "what matters" details you enter aren't used to automatically match products across stores yet —
  that's a planned next step.

## Managing your watchlist

Open the **Manage Watchlist** tab to add a product, remove one, or change how often you expect to buy
it. For each product you can also record what actually matters to you about it — not just a brand.
For example:

- For K-cups, the **variety** ("Donut Shop blend") might matter more than the brand — any brand works
  as long as it's that blend.
- For coffee creamer, both the **brand** and a **variety** like "coconut" might matter.
- For something with a health need, like a **dietary** requirement ("lactose-free"), you can flag that
  as a "must match" so it's never treated as a nice-to-have.

Each thing you add gets an importance level — **must match**, **preferred**, or **flexible / just
noting** — so the engine (once it uses these) can tell "this is non-negotiable" apart from "nice to
have if convenient."

## Using the dashboard

- **Theme**: use the **Day / Night / System** switch in the top-right corner. "System" matches your
  device's light/dark setting automatically.
- **Version number**: shown next to the RestockRadar title in the header, so you can tell which build
  you're looking at.
- Works on your phone or tablet, not just a desktop browser.

## Your data

Your purchase history (`transaction_log.csv`) stays on the machine running RestockRadar — it is not
included in the public source code for this project.
