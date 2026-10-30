# Landing page brief

The user asked for the public home page (`/`) to follow two Dribbble shots by Phenomenon Studio:

- **Vertex** (https://dribbble.com/shots/27357269): white page; nav with links on the left, the logo centred, "Book a call" and a second action on the right; a huge uppercase headline in two lines on the left with a short paragraph on the right; under it a wide hero photo card whose corners have notches cut out (rounded card with small rounded cut-outs at the corners and a tab at the top centre); a frosted glass info card floating over the photo ("Orange tower", one line of copy, "View more" pill with an arrow).
- **Elyse Residence** (https://dribbble.com/shots/25815603): dark luxury sections; a full-bleed photo with an enormous serif wordmark across the lower left and a small italic serif tagline on the right ("Holistic luxury in perfect harmony"), a "Book a visit" pill top right; very large serif numbers for stats ("150k" with a small caption); three pillars with small uppercase italic serif headings over short copy; editorial serif headings ("Wellness-centred") beside image collages.

## Direction for Artha Samoedra

Light Vertex hero on top, then alternating Elyse-style dark editorial sections. Keep the WIT tokens for colour (ink for dark sections, the accent for one highlight per section, greys from the ladder); the serif is the one allowed addition.

1. **Nav (landing only, over the hero):** links Properties, Areas, Blog, For partners on the left; the logo mark centred; "Ask Jessy" outline pill and "Book a visit" ink pill on the right. Phones: logo left, menu button right.
2. **Hero (Vertex):** headline in uppercase DM Sans at `text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-tight`, two lines: "VERIFIED PROPERTY, / READY TO VISIT". Right column: one paragraph and a pill search (type, city) that goes to `/properties?q=`. Below: the notched photo card, `aspect-[16/7]` on desktop and `aspect-[4/5]` on phones, built with a CSS mask (radial-gradient cut-outs) or an SVG clip path so it works without images. Floating frosted card (`bg-white/70 backdrop-blur rounded-2xl`) showing the featured listing (`isFeatured`, else the newest live listing): name, one line, price, "View more" pill linking to it.
3. **Stats band (Elyse numbers):** three or four very large serif numbers from live data (live listings, cities, partners, verified certificates %) with small uppercase captions.
4. **Dark showcase (Elyse hero):** ink full-width section with a photo panel, the serif wordmark "Samoedra" huge across it, an italic serif tagline, and a "Book a visit" pill that opens the Jessy chat with "I would like to book a site visit".
5. **Three pillars (Elyse):** small uppercase italic serif headings: "Verified titles", "One chat, any question", "Exclusive marketing", each with two lines of copy.
6. **Featured properties:** editorial heading in serif, a horizontal snap-scroll row of large property cards (`ListingCard` restyled or a larger variant) with Featured badges and price-drop prices.
7. **Area guides:** serif heading with a collage of area guide cards linking to `/areas/:slug`.
8. **Partner call to action:** split section, copy left, "List your property" pill to `/partners`.
9. **Journal:** latest blog posts as a three-column editorial list.

## Rules

- **Typography:** add one serif display face from Google Fonts in `apps/web/index.html`: Fraunces (opsz, wght 300 to 600, italic). Expose it as a Tailwind token `--font-display` in `apps/web/src/index.css` (`@theme { --font-display: 'Fraunces', ui-serif, Georgia, serif; }`) and use `font-display` only on the landing and the public site headings. The console stays DM Sans only.
- **Photos:** the repo has no photography yet. Every photo slot uses a CSS background with a real image path first and a designed fallback second, so the page looks finished before photos arrive:

  ```
  style={{ backgroundImage: "url(/landing/hero.jpg), linear-gradient(...)" }}
  ```

  The fallback is a soft architectural gradient built from tokens (for example ink to ink-3 with an accent glow, or surface-2 with diagonal light). Document the expected files (`apps/web/public/landing/hero.jpg`, `showcase.jpg`, `area-*.jpg`) in a short comment at the top of the page file.
- **Colour and tokens:** colours come from tokens (`bg-ink`, `text-on-ink`, `bg-accent`, `text-muted`). No hex in class names. The gradient fallbacks may use `color-mix` over `var(--color-*)`.
- **Behaviour:**
  - Respect `prefers-reduced-motion`.
  - Keep one `h1` on the page, the hero headline.
  - Phone width 375 px has no sideways scroll (the snap-scroll row scrolls inside its own box).
  - Set the document title and meta description.
