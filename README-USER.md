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
- Suggests which of your past purchases (across all the different names stores use for the same thing)
  belong to each watchlist product, using the brand/variety details you entered — you review and
  approve or dismiss each suggestion, nothing links automatically.
- Shows how much of your purchase history is actually organized, and lets you go the other direction —
  starting from an unlinked purchase and picking which watchlist product it belongs to (or telling it
  that item will never be a watchlist product).

## What it doesn't do yet

- It doesn't check live prices at stores yet — today it only learns from your past purchase history.
- It doesn't automatically create alerts yet (deal detection is still being built).

## Managing your watchlist

Open the **Manage Watchlist** tab. Each product is a collapsed row — click anywhere on its name to
expand it and see everything below (criteria, preferred products, purchase history). Collapsed, you
still see a one-line summary: target rate, how many criteria and linked purchases it has, and its
first-choice product if you've set one.

Add a product, remove one, or change how often you expect to buy it. For each product you can also
record what actually matters to you about it — not just a brand. For example:

- For K-cups, the **variety** ("Donut Shop blend") might matter more than the brand — any brand works
  as long as it's that blend.
- For coffee creamer, both the **brand** and a **variety** like "coconut" might matter.
- For something with a health need, like a **dietary** requirement ("lactose-free"), you can flag that
  as a "must match" so it's never treated as a nice-to-have.

Each thing you add gets an importance level — **must match**, **preferred**, or **flexible / just
noting** — so the engine can tell "this is non-negotiable" apart from "nice to have if convenient."

### Choosing preferred products

Under **Preferred products**, you can name up to 5 specific real products for each watchlist entry:
a **first choice** (shown as a filled "1") and up to 4 **backups**, numbered 2-5 in the order you'd
accept them. Each one is just a name, with an optional site and a link to the product page. This is
separate from "what matters" above — criteria describe the rule (any Donut Shop blend), while preferred
products name the actual things you'd buy (this specific Costco box, or that specific Amazon listing as
a backup). Once live price-checking exists, this is what it will check in order: first choice, then
each backup in order.

If you paste a product page link, click the wand icon next to it to try pulling the product's name,
thumbnail, current price, and package quantity automatically instead of typing them yourself. This
works by reading the same page info sites publish for link previews (like what shows up when you
paste a link in a chat app) — it's a one-time snapshot, not an ongoing price check, so the price
shown is just "what it cost when you added it," and won't update on its own. It won't work on every
site: some retailers (Walmart, in testing) actively block this kind of request and show a "prove
you're human" page instead, in which case you'll just need to type the details yourself — every
field is always editable either way.

### Telling the app what a good deal actually is

Price alone can't tell you if something's a good deal — $18.99 is great for an 80-count box of
K-cups and terrible for a 12-count box. That's what **Quantity** and **Good price** are for:

- When you add or edit a preferred product, fill in **Quantity** — how many of the product's unit
  (whatever you set as the watchlist item's unit, like "ct" or "oz") are in that package. The wand
  button tries to guess this from the product title (e.g. it'll catch "80 Count" or "52 oz"), but
  it's a guess — check it.
- On the product itself (click **Edit**), set **Good price (per unit)** — the threshold you already
  know from experience, like `0.35` for "$0.35 a K-cup or better."

Once both are set, each preferred product shows its actual unit price next to its total price,
highlighted **green** if it's at or under your threshold and **red** if it's not — so the app is
making the same call you'd make yourself, just automatically.

The **Coverage** tab shows the same green/red unit price for your actual purchase history, not
just preferred products — a "Last price" column with the most recent price you paid and, where it
could figure out the package size from the product name, the per-unit price too. This only shows
the good/bad-deal color for items linked to a watchlist product with a **Good price** set (since
that's what it's comparing against); unlinked items still show the price, just without the color.

**For sites that block that lookup** (Walmart included), there's a better option: the RestockRadar
browser extension in the `extension/` folder. Install it once (see `extension/README.md` — it's a
few clicks in Chrome's extension settings, not published to the store), then whenever you're on a
product page on any site, click the extension icon and it grabs the name/thumbnail right from the
page you're already looking at — since it's your own browser viewing the page normally, sites can't
tell it apart from you just browsing, so it works even where the one-time lookup above doesn't.

### Linking a product to its purchase history

Under each product, click **Find matches in purchase history**. You'll get a list of past purchases
that might be this product, ranked by how likely they are, using what you told it matters. For each
one you can **Accept** (link it in) or **Dismiss** (never suggest that one again for this product).

Brand-only matching can occasionally suggest something from the wrong product — e.g. a different
Chobani-brand item showing up under your yogurt entry. That's expected; just dismiss it. Adding a
**variety** or other criterion (not just brand) usually makes the suggestions more precise.

## Checking your coverage

Open the **Coverage** tab to see the big picture: what percent of your purchase history is linked to a
watchlist product, and every purchase-history item with its status — **Linked**, **Unmatched**, or
**Ignored** — in one table.

Use the **Status**, **Site**, and search filters at the top to narrow it down — e.g. Status = Linked to
review and correct existing links, or Status = Unmatched to keep triaging what's left.

Actions depend on an item's status:

- **Unmatched**: pick a product from the "Assign to…" dropdown and click the link icon, or click the
  eye-slash icon to **Ignore** it (for things that will never be a watchlist product — a one-off Amazon
  purchase, a DVD, produce you're not tracking yet).
- **Linked**: shows which product it's linked to; click the unlink icon to undo it (it goes back to
  Unmatched). Use this if a suggestion or assignment turns out to be wrong — e.g. a differently-flavored
  item from the right brand got linked to the wrong product.
- **Ignored**: click the eye icon to un-ignore it, putting it back into Unmatched.

### Doing this in bulk

Check the box next to any items you want to handle together, or check the box in the table header to
select everything currently visible (on the current page, after filters). Once you've selected at least
one item, a bar appears above the table with:

- A dropdown of what to do: **Assign to product…**, **Ignore**, **Un-ignore**, or **Unlink**.
- For "Assign to product…", a second dropdown to pick which product.
- An **Apply** button.

This is the fastest way to clear out a filtered view — e.g. filter to Status = Unmatched, search for a
name pattern, select-all, and assign everything at once. "Unlink" and "Un-ignore" only do something to
items that are actually linked/ignored — applying them to a mixed selection just skips the items where
they don't apply.

## Using the dashboard

- **Theme**: use the **Day / Night / System** switch in the top-right corner. "System" matches your
  device's light/dark setting automatically.
- **Version number**: shown next to the RestockRadar title in the header, so you can tell which build
  you're looking at.
- Works on your phone or tablet, not just a desktop browser.

## Your data

Your purchase history (`transaction_log.csv`) stays on the machine running RestockRadar — it is not
included in the public source code for this project.
