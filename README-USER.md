# RestockRadar

RestockRadar keeps an eye on the groceries and household products you buy regularly and helps you
find genuinely good deals on them, using your own purchase history as the yardstick.

## What it does today

- Has a **Deal Finder** tab: press Analyze to see, across your whole watchlist at once, every
  captured store price ranked cheapest-first against your own purchase history — a report you can
  re-run any time, telling you where to buy something today even if you're not out of it yet.
- Has a **Purchases** tab for adding to your history yourself — either one quick item (a stop on
  the way home, nothing else worth logging) or a full CSV of receipts at once — with a prompt right
  there to link what you just added to a watchlist product.
- Shows your watchlist — the products you've asked it to track, and what you told it matters about
  each one.
- Lets you add, edit, or remove watchlist products yourself, any time you change your mind.
- Suggests which of your past purchases (across all the different names stores use for the same thing)
  belong to each watchlist product, using the brand/variety details you entered — you review and
  approve or dismiss each suggestion, nothing links automatically.
- Shows how much of your purchase history is actually organized, and lets you go the other direction —
  starting from an unlinked purchase and picking which watchlist product it belongs to (or telling it
  that item will never be a watchlist product).
- Requires signing in, with three levels of access — see **Accounts and access** below.

## What it doesn't do yet

- It doesn't check live prices at stores yet — today it only learns from your past purchase history,
  plus whatever price you've captured yourself via the wand button or the browser extension.
- Deal-checking has to be triggered manually (the Analyze button in Deal Finder) — nothing runs on a
  schedule yet, since RestockRadar isn't deployed anywhere that's always on.

## Managing your watchlist

Open the **Manage Watchlist** tab. Each product is a collapsed row — click anywhere on its name to
expand it and see everything below (criteria, preferred products, purchase history). Collapsed, you
still see a one-line summary: its unit and good-price threshold (if set), how many criteria and
linked purchases it has, and its first-choice product if you've set one.

Add a product or remove one. For each product you can also
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

- When you add or edit a preferred product, fill in **Quantity** and **Unit captured in** — how
  many of something, and what that something actually is (fl oz, ct, l, oz…). The wand button
  tries to guess both from the product title (e.g. it'll catch "80 Count" or "52 oz"), but it's a
  guess — check it. The unit matters as much as the number: a case of twelve 12 fl oz cans and a
  2-liter bottle both just have "a quantity" without it, and there's no way to tell "how many" a
  price applies to. If a captured unit doesn't convert into this product's own unit (e.g. a count
  next to a volume), you'll see a warning instead of a wrong-looking price — that choice just won't
  get a unit-price comparison rather than an incorrect one.
- On the product itself (click **Edit**), set **Good price (per unit)** — the threshold you already
  know from experience, like `0.35` for "$0.35 a K-cup or better."

Once both are set, each preferred product shows its actual unit price next to its total price,
highlighted **green** if it's at or under your threshold and **red** if it's not — so the app is
making the same call you'd make yourself, just automatically.

The **Purchases** tab shows the same green/red unit price for your actual purchase history, not
just preferred products — a "Last price" column with the most recent price you paid and, where it
could figure out the package size from the product name, the per-unit price too. This only shows
the good/bad-deal color for items linked to a watchlist product with a **Good price** set (since
that's what it's comparing against); unlinked items still show the price, just without the color.

### Checking against your own price history, not just a fixed number

**Good price** (above) is a number you type once. There's a second, automatic check that compares
a captured price against your *actual buying history* instead — expand a product in Manage
Watchlist to see its **Price history**: the all-time low, your recent average, and what you last
paid, all per unit. Under that, each preferred product with a price gets a verdict against that
history — an all-time-low, a real dip below your recent average, or just typical.

To turn a "this is a deal" finding into something you actually see, open the **Deal Finder** tab
and press **Analyze** — see the next section for how that works.

**For sites that block that lookup** (Walmart included), there's a better option: the RestockRadar
browser extension in the `extension/` folder. Install it once (see `extension/README.md` — it's a
few clicks in Chrome's extension settings, not published to the store), then whenever you're on a
product page on any site, click the extension icon and it grabs the name/thumbnail right from the
page you're already looking at — since it's your own browser viewing the page normally, sites can't
tell it apart from you just browsing, so it works even where the one-time lookup above doesn't.

### Finding today's deals across your whole watchlist

The **Deal Finder** tab answers a different question than the per-product Price History above:
not "is this one product's captured price good," but "across everything I track, where should I
actually buy today, even if I'm not out of it yet." Press **Analyze** and it re-checks every
captured store price against that product's own history and shows you the full picture — split
into **Good deals right now** and **everything else** — every time you run it, showing the current
state, not just what's changed since last time.

Two things worth knowing:
- It only reports on products where you've captured at least one price via the wand or extension —
  it can't check live prices at stores itself. If a product's missing here, that's what the
  **Price checks due** panel at the top of this same tab is for.
- A "stale" flag on a captured price means it might not reflect today's actual price — recapture
  it (wand or extension) before trusting a deal that's flagged that way.

### Linking a product to its purchase history

Under each product, click **Find matches in purchase history**. You'll get a list of past purchases
that might be this product, ranked by how likely they are, using what you told it matters. For each
one you can **Accept** (link it in) or **Dismiss** (never suggest that one again for this product).

Brand-only matching can occasionally suggest something from the wrong product — e.g. a different
Chobani-brand item showing up under your yogurt entry. That's expected; just dismiss it. Adding a
**variety** or other criterion (not just brand) usually makes the suggestions more precise.

## Purchases

Open the **Purchases** tab to see your actual purchase history — every item, with its status
(**Linked**, **Unmatched**, or **Ignored**), in one table. That table is the point of this tab;
adding new purchases is deliberately tucked behind a button above it, not the first thing you see.

A line above the table sums it up: what percent of what you're *actually tracking* is linked, how
many items are unmatched, how many are ignored, and the total purchase count. That percentage
deliberately leaves ignored items out of the math entirely — ignoring something (a one-off Amazon
DVD, produce you're not tracking) is a decision you already made, not unfinished work, so it
shouldn't make the number look worse. A household that's ignored 90% of its history and linked the
rest legitimately reads "100% of what you're tracking," not some tiny, misleading digit.

Use the **Status**, **Site**, and search filters to narrow the table down — e.g. Status = Linked to
review and correct existing links, or Status = Unmatched to keep triaging what's left.

### Adding a purchase

Click **Add purchase** above the table whenever you've bought something new — this is meant to be
a weekly habit, not an occasional chore, just not the main event on this page.

**Add a single purchase** is for the common case: you stopped somewhere and bought one thing worth
logging, nothing else. Fill in the site, product name, and what you paid — site and date stay
filled in after each add, so logging a few different things from the same trip is just clearing
the product/price fields each time. Only bought more than one of the exact same package? Click
**Bought more than one?** to reveal that field; otherwise it's assumed to be 1. There's no receipt,
so there's no `order_id` to match against — one gets made up for you (`manual-...`) so the row
still fits the same table as everything else.

**Pack size** (optional) is how many of the product's own unit are inside *one* package — 24 for a
24-roll pack of toilet paper, not the 1 package you bought. Leave it blank and the app tries to
guess it from the product name (only works if the name itself states a size, like "24 Mega
Rolls"); if the name doesn't say, or the guess would be wrong, type the real number here — it
always wins over any guess.

**Import a full receipt** is for a real receipt or order-history export — paste its rows or choose
a file, in the same CSV shape as `transaction_log.csv` (`date, site, order_id, product_name,
quantity, unit_price, total_price, shipping_charge, product_id, category, delivery_status,
recent_24mo`). It's always safe to import a file that overlaps with what's already in your
history — anything already there is skipped, never double-counted, so re-importing a full export
after adding a few new orders to it works fine.

After a single add, you'll see a row of buttons right there — RestockRadar's best guesses for
which watchlist product it belongs to, ranked most-likely first, plus a **Something else…**
dropdown for anything not guessed and a **Not tracked** option for a one-off that'll never be a
watchlist product. Link it right then, or leave it and it'll show up unmatched in the table below
later, same as anything from a bulk import — a full receipt always goes straight to the table for
triage rather than prompting per-row, since a real receipt can have far too many new items to
review one at a time.

### Triaging the table

Actions depend on an item's status:

- **Unmatched**: pick a product from the "Assign to…" dropdown and click the link icon, or click the
  eye-slash icon to **Ignore** it (for things that will never be a watchlist product — a one-off Amazon
  purchase, a DVD, produce you're not tracking yet).
- **Linked**: shows which product it's linked to; click the unlink icon to undo it (it goes back to
  Unmatched). Use this if a suggestion or assignment turns out to be wrong — e.g. a differently-flavored
  item from the right brand got linked to the wrong product.
- **Ignored**: click the eye icon to un-ignore it, putting it back into Unmatched.

Every item also has a pencil icon, regardless of status — click it to fix the name or set the
package quantity by hand:

- **Fix the name**: Costco receipts in particular sometimes come through garbled — a size dropped
  entirely ("POISE PLUS," no count anywhere), or text merged in from the line above or below it on
  the receipt ("BUTTERNUT SQ CASCADE," "'TALIANO BRD"). Type in what it actually is; the correction
  applies everywhere that name was used (any link, ignore, or price history it already had).
- **Set the pack quantity by hand**: for something like "POISE PLUS" there's no size in the name at
  all, so the app has nothing to guess from — it can't tell you whether the price was good. Type in
  the real count (check the box or a recent receipt) and it'll compute the per-unit price from that
  going forward. An item you've corrected this way shows "(edited)" next to it so you can tell it
  apart from an automatic guess; clearing the field back to empty lets the app try guessing again
  next time it runs.
- **Fix the price or quantity bought**: if the import itself got something wrong — a misread price,
  for instance — and the item shows "Times bought: 1," you can correct the price paid and how many
  you bought right there too. This only works for a single purchase: if an item groups several
  purchases together, there's no one price to correct (you'd see "(multiple purchases)" instead,
  since picking one specific purchase out of a group to fix isn't built yet).

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

## Accounts and access

Everyone signs in. There are three levels:

- **Admin** — everything, including creating accounts and resetting anyone's password.
- **Contributor** — can see and change everything except accounts (add purchases, edit the
  watchlist, link/ignore/correct things in Purchases).
- **Viewer** — can see everything (Deal Finder, the watchlist, your purchase history) but can't
  add, edit, link, or import anything. A "read-only" tag next to your name in the header is the
  reminder.

Open the **Settings** tab to:
- **Change your password** — needs your current one.
- **Manage your API tokens** — needed for the browser extension, which can't stay signed in the
  way the web app does (it lives at its own address, separate from this one). Create a token here,
  copy it immediately (it's shown exactly once and can't be viewed again — only its hash is ever
  kept, the same way your password itself is never stored in plain text), then paste it into the
  extension's own **Backend settings** section, next to the API URL. Revoke a token any time from
  here if you no longer trust wherever you pasted it.
- **Manage accounts** (admin only) — create an account for anyone else in the house, set their
  role, deactivate one without deleting it, or reset a password directly. There's no
  self-registration and no email-based "forgot password" link (this app doesn't send email) — an
  admin handles all of that by hand, which for a household app living on your own network is
  simpler than it sounds.

## Using the app

- **Theme**: use the **Day / Night / System** switch in the top-right corner. "System" matches your
  device's light/dark setting automatically.
- **Version number**: shown next to the RestockRadar title in the header, so you can tell which build
  you're looking at.
- Works on your phone or tablet, not just a desktop browser.

## Your data

Your purchase history (`transaction_log.csv`) stays on the machine running RestockRadar — it is not
included in the public source code for this project.
