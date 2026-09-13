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

Open the **Manage Watchlist** tab to add a product, remove one, or change how often you expect to buy
it. For each product you can also record what actually matters to you about it — not just a brand.
For example:

- For K-cups, the **variety** ("Donut Shop blend") might matter more than the brand — any brand works
  as long as it's that blend.
- For coffee creamer, both the **brand** and a **variety** like "coconut" might matter.
- For something with a health need, like a **dietary** requirement ("lactose-free"), you can flag that
  as a "must match" so it's never treated as a nice-to-have.

Each thing you add gets an importance level — **must match**, **preferred**, or **flexible / just
noting** — so the engine can tell "this is non-negotiable" apart from "nice to have if convenient."

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
