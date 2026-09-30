# Rarefriend Outlaw

SDK version **v0.1.4**. A Gun Fright-inspired prototype built on the SDK's
standard isometric terrain, **extended into open country**: a 9 × 9 grid of
SDK world tiles with the `01-garden-oval-complete` preset (from
`@rarefriends/friendsdk/world`) as the garden tile and 80 generated
garden-style tiles around it, scrolled at **2× around a 1× Rare Friend** inside the
960 × 640 window, with a Centralised Exchange, inventory and equipment, wandering
hacker outlaws whose hardware wallets you crack, and animals to net. The SDK's `GameWorld` component
has a fixed camera on one 576 × 384 plane, so the component renders the SDK's
own world layers itself: `loadWorldAssets` per tile (terrain, monochrome
dithered style), `renderProp` artwork for props, `project`/`unproject`,
`isWorldWalkable` for collision, and `spriteFrame` for the canonical Friend
artwork. The component has no application routes, navigation, wallet
connection code or identity gate; the SDK runtime supplies those and the
selected, verified owned Friend.

## Submission (Rare Friends Vibeathon)

| | |
| --- | --- |
| **Project** | Rarefriend Outlaw |
| **Builder** | Alley Cat (GitHub [@alleycat-dev](https://github.com/alleycat-dev)) |
| **Category** | Economy Potential |
| **One sentence** | Your own Rare Friend rides out as a bounty hunter on a Bounty Hunter licence bought with RF, hunting twelve crypto-scam outlaws across a Western country and hacking their hardware wallets for OP, keepsakes and seed words, while the licence's RF payout comes from the SDK's chance game. |
| **Stack** | FriendSDK **v0.1.4**, CLI game (`index.tsx` component on the SDK runtime); no changes to the SDK itself |
| **Source** | This folder, `games/rarefriend-outlaw/`, in the builder's fork of FriendSDK, branch `rarefriend-outlaw` |
| **Playable preview** | GitHub Pages build of this game (link in the submission PR) |
| **Wallet and network** | A wallet on **Robinhood mainnet** holding a hardwired Generations NFT, **generation 1 or higher**; the SDK runtime checks ownership before the game loads, even in the preview |
| **Economy** | **Simulated.** No real RF is spent or paid out in the preview; the licence office and Game Rules say so |

**Run it locally** from the SDK root (Node.js 22 or newer):

```sh
npm install
npm run build
npx friendsdk dev ./games/rarefriend-outlaw
```

**Build the preview:** `npx friendsdk build games/rarefriend-outlaw`, then `npx friendsdk check games/rarefriend-outlaw`; the
static site is `games/rarefriend-outlaw/.friendsdk/`.

**Controls and rules:** see [Controls](#controls), the in-game **Game Rules** button and the hacking game's **?** page.
**RF costs, odds and consumable rules:** the licence is the game's one SDK consumable, **20 RF** (100 RF planned for a live
version, with every reward multiplied by five; the SDK preview wallet holds exactly 20 RF), and its payout table with chances is
under [RF: the Bounty Hunter licence](#rf-the-bounty-hunter-licence) (17.1 RF back on average, 85.5%). Everything else (OP,
reloads, horses, keepsakes, program cards, the Vault, seed words, trophies and the Cold Wallet) is simulated in-game and pays no
RF; the keepsake drop odds are in `KEEPSAKES.md`.

**Economy potential:** the SDK bridge offers a single consumable at one price, so the licence is the only thing sold for RF. With
a modified or extended SDK that supports more items and prices, the game is ready to sell many more assets and cosmetics for RF:
Trojan Horses (including the Shiny Golden one), laser reloads, the keepsake cosmetics (hats, masks, capes, off-hand items and
pets), program cards and gas vouchers, and extra hunts or licence tiers. Cosmetics and upgrades without an RF redemption promise
need no prize reserve, and keepsakes are already designed to be minted into the Friend's wallet.

**Checks** (SDK v0.1.4, from the SDK root): `npm test` (116 pass, 2 skipped: the optional Foundry contract tests), `npm run
typecheck`, `npm run check:games` (all valid), `npm run check:browser` (16 pass), `npx tsc -p games/rarefriend-outlaw/tsconfig.json`
and `npx friendsdk test ./games/rarefriend-outlaw` (pass).

**Assets:** all game art is drawn in code for this game (pixel masks and canvas drawings in `index.tsx`, `cosmetics.ts`,
`trophies.ts`, `rewards.tsx` and `wallet-icons.ts`). The world terrain, props and the canonical Friend artwork come from the SDK
(`@rarefriends/friendsdk/world`, `renderProp`, `spriteFrame`), recoloured in places. No third-party assets or fonts.

**Known issues and limits:**

- **Wallet warning on the preview:** MetaMask may flag the brand-new preview address
  (`alleycat-dev.github.io`) as a possibly malicious site. It is not on MetaMask's or PhishFort's public blocklists; new github.io
  pages that ask to connect a wallet can trip its reputation check. The preview build
  contains no RF transfer, approval or signing code (FriendSDK v0.1.4 leaves it out of previews): it only asks to **connect**, reads
  which Friends you own and plays the simulated economy. Never approve a signature or transaction request on it.
- No saves: the game lives in memory, so a reload loses the run's progress (an unused licence, or one waiting to reveal its
  payout, is recovered by the licence office).
- Touch: walking (tap), menus, the minimap, posters and the whole hacking game work by tap, and on touch screens small **Use**,
  **Switch** and **Dismount** buttons (left of the minimap) stand in for Space, Q and R.
- Minting at the Cold Storage terminal is a selection screen only; nothing is minted yet.
- No audio, so no mute control is needed yet.
- The licence is 20 RF rather than the planned 100 RF, so it can be bought with the SDK preview wallet's 20 RF.
- Capability gaps for a live version: the SDK bridge has one consumable at one price, so OP, reloads, horses and all loot stay
  simulated, and a live run would need saving outside game memory.

## The country

The navigable world is **5184 × 3456 world units** (9 × 9 tiles of the SDK's
576 × 384 plane), about 45× the garden oval's original walkable area. Each
tile is a real SDK `WorldConfig` validated with `validateWorld`: the garden
tile (column 2, row 2) keeps the garden's patches, paths and props on a full-plane ground (so
the oval boundary no longer walls the player in, with short connector paths
joining the garden path to its edges); the other 80 are generated from a
per-tile seeded PRNG with 2–3 patches (dither / dense / grid / water; the light ones in Western range colours by
`sandyPatches`: dither on sand #ead7a4, dense on dry red clay #d9a98c, grid on sage scrub #c8d3b0, and water (the Mining Pool
too) dark blue #1f3b63 behind its white ripples; it gives the patch rectangles coloured copies of the SDK's patterns;
trees are drawn in faded pastels by `pastelTree`: a medium green canopy, #a6c79a, and a faded brown trunk, #b39a7c (it also
fixes the SDK tree's shading, which spilled below the canopy over its outline and the trunk: the shading now stays inside the
canopy, the outline is redrawn over it and the trunk reaches up under the canopy); roads run without breaks: `seamless` leaves
out the SDK's black outline on every tile edge shared with a neighbouring tile, which showed as a strip across each road there,
and keeps it on the world's own border; the
dotted trails are wagon-trail brown, #cdb593; and `westernProp` redraws the SDK's misdrawn bench (its backrest floated off the
seat and its posts missed the seat's corners) as a weathered-wood seat slab, #c4a482, on four black iron legs with a slatted
backrest on two posts at the seat's back edge, and colours rocks weathered stone, #bab2a5, reeds faded olive with
cattail-brown heads, #a9b27c and #9c7a58, and planters terracotta, #d38d70, with a darker terracotta front and dark soil, holding redrawn plants instead of the SDK's
misdrawn ones (square leaves off their branch tips, a tiny flower tangled into a stem): by position, either a small saguaro with
a pink bloom or three exotic flowers (coral, orchid, plumeria yellow) on clean stems with sage leaves (`PLANTER_PLANTS`);
every black outline and dot is kept), one
connected road grid (east-west roads on tile rows 2 and 4, north-south roads
on columns 2 and 4, meeting at four intersections including the garden;
elbows vary per tile, ends always meet at the tile edge, no isolated road
fragments), and 8 props each from the garden's palette (trees, flowers, reeds, benches, rocks, planters). Water
patches and prop footprints block movement exactly as in the SDK, via
`isWorldWalkable` on whichever tile a point falls in; only the world's outer
edge is a hard boundary (drawn with the SDK's cliff). Interior tile seams are
covered so the ground reads as one continuous plane.

Run it with the SDK's local game command from the SDK root:

```sh
npm run dev:game -- games/rarefriend-outlaw
```

### Playtesting the last level

`node games/rarefriend-outlaw/tools/playtest.mjs` generates `playtest-liquidator/`: a copy of the game's sources with the switch in
`playtest.ts` on, so every hunt starts at The Liquidator's wave with 11 of the 12 seed words in hand. Run it with
`npx friendsdk dev ./games/rarefriend-outlaw/playtest-liquidator`. The copy is git-ignored and is not part of the game; re-run the
tool after changing the game. The shipped game keeps `PLAYTEST.liquidator` off.

## Controls

The game's own menus stop 64 px above the bottom edge (`style.css`), so the SDK runtime's toolbar (Local preview, the Friend,
Friend wallet), which floats over the bottom of the game from outside its page, never covers them. **Reduce motion** in Settings
stills decorative animation (animals bobbing and hopping, blinking lights, pulsing markers, the cryo bubbles, and the hacking
game's sweeps, sparks, floating numbers and flying programs); it starts from the device's reduced-motion preference and never
changes the rules.

| Input | Action |
| --- | --- |
| `W` / `A` / `S` / `D` or arrow keys | Walk |
| Tap / click a spot | Walk to that point; a pulsing ring with a cross marks it until you arrive |
| Walk against the Centralised Exchange's door | Open the shop (once per visit; step away to re-arm it) |
| `Q` | Cycle the equipped item through owned items (a note says so when there is nothing to hold) |
| `I` | Open or close the inventory |
| `M`, or tap the minimap | Enlarge the minimap over the world, or shrink it back (`Esc` also shrinks it); hover a marker to see what it is |
| `Space` | Use the equipped item: fire a laser bolt, or throw the Butterfly Net at a nearby butterfly |
| Hit a hacker with a laser bolt | Wing it, or down it once it has taken its tier's hits (1 to 5), and get the offer to hack its hardware wallet |
| Walk into an outlaw | It robs you of one item (dropped back into your inventory the moment it is neutralized) |
| Walk against the front of the Data Center, Charging Station, Cold Storage or Mining Farm door | Go inside; walk out through the doormat at the bottom |
| Walk into the Charging Station's terminal (top-left room) | Reload the Laser Gun: 1 OP a shot, up to 50 in the gun |
| Walk into the Cold Storage's terminal (top-left room) | Open the mint terminal: select game items and achievements to mint into the Friend's wallet (minting not live yet) |
| Walk into the Cold Storage's other terminal (bottom-right room) | Open The Vault: store things safe from outlaws, or take them back |
| Touch buttons **Use** / **Switch** / **Dismount** | On touch screens only, left of the minimap: the same as `Space`, `Q` and `R` (Use shows while you hold something, Dismount while you ride) |
| `G` | On the Front-Running board, toggle priority gas (also a button under the board) |
| `Esc` | Close a menu or the large map, give up on a wallet, or leave a finished wallet (the hack ending already took you back to the start, in front of the Centralised Exchange, behind the board, so the country is ready when you close it) |
| HUD buttons | Licence (the licence office: buy and start a run, see it, retire), Inventory (equip items, redeem SDK rewards), Game Rules (how the world works, like the ? in the hacking game), Settings (Reduce motion, and the Credits: Alley Cat, Lead Developer; built with Claude Code, Anthropic) |

The HUD strip reads your RF and OP, then what is in your hand (the Laser Gun with its charges, or an item and how many you
hold), with "Preview" at the end outside live play. Near a building's door, the exchange's door or a terminal inside, a
"Walk in" label names what it opens. While you ride a Temporary Trojan Horse a bar at the top counts its seconds down (red
for the last ten), and a parked one with its time running shows its seconds over it.

## Life and encounters

- **One wanted outlaw at a time, in a fixed order.** Outlaw "waves" follow
  the `NAMED_OUTLAWS` list in `index.tsx`: Rugpuller, Pig Butcher, Exit
  Scammer, Wallet Drainer, Pumper & Dumper, Honeypot,
  Black Hat Hacker, Mrs. Sybil, Front Runner, Sandwich Bot, Dr. Ponzi and
  The Liquidator (twelve waves). The next
  wave is the next name. The **Pig Butcher** keeps to the Mining Farm
  (`OUTLAW_HOMES`): when he hides it is always inside it, outdoors he spawns
  110-240 units from it, and he turns back once he strays past 260 units.
  The **Exit Scammer** always shows his back, and he walks away from the
  Friend whenever it comes within 260 units (`FLEE_RANGE`). When his way is
  blocked he takes the open heading that leads most directly away. He walks
  at 75 against the Friend's 100, so you can close in, and the laser moves
  at twice his pace.
  After The Liquidator no more outlaws appear: a
  message says every outlaw has been brought in and the guide line reads "The
  country is clear". A new session begins with the Rugpuller again. A wave is a single named outlaw, except **Pumper & Dumper**,
  which puts two outlaws in the world at once, named Pumper and Dumper. The
  next wave is rolled only after every outlaw of the current wave is defeated
  (9–15 s later), so there is never more than one wanted party at large.
  Named outlaws can have their own art in `OUTLAW_ART` (any grid size, drawn
  at 5 px cells in the world with the animals' underside shading, and fitted
  to the WANTED poster frame at up to 4 px): the **Rugpuller** carries a rolled
  rug with burgundy accents, the **Pig Butcher** a cleaver and a
  blood-red splattered apron, the **Wallet Drainer** a wallet with gold
  accents, the **Honeypot** a dripping honey pot with honey-coloured
  accents, the **Black Hat Hacker** a black hat, fluorescent green goggles
  and a hoodie, **Mrs. Sybil** a small figure surrounded by a flicker of copies of
  herself, with red accents (and "her belongings" in her dialog), the **Front Runner** a running figure with red accents and a red
  sweatband, the **Sandwich Bot** a robot with a gold antenna and a gold
  sandwich filling, **Dr. Ponzi** a white-coated doctor raising a gold pyramid, **The Liquidator** a hulking enforcer with blue droplets flying from one hand, **Pumper** a pump with green accents, **Dumper** a dumped heap
  with red accents, and the **Exit Scammer** is drawn from behind
  with "EXIT" lettered across his back in red. Because of that lettering he
  is never mirrored, whichever way he walks (`noMirror`). Names without custom art map to one of three
  hood variants of the default hooded sprite, and the
  name is drawn above the sprite. **Animals** follow `ANIMALS.md`: eighteen
  species (bee, rabbit, cat, dog, deer, cow, pig, bird, frog, ostrich, snake,
  rooster, hen, butterfly, lion, bear, golden fox, dragon), each with a
  **Chance** and a **# Alive** count. Chance 100 means the species is always
  present at exactly that count (67 animals at the start: 20 bees, 3 rabbits, 2 cats,
  1 dog, 6 deer, 5 cows, 4 pigs, 2 roosters, 8 hens, 5 birds, 5 frogs,
  1 ostrich, 3 snakes, 2 butterflies); a lower chance is the percentage that the species is
  present at all (lion and bear 5%), and 0 means never (fox and dragon for
  now). Deer and cows arrive as a cluster. **Bees** are tiny (2 px cells)
  and buzz in one swarm with small random turns, within 45 units
  (`SWARM_RADIUS`) of their anchor. The anchor starts as a single tree, the
  first tree more than 900 units from the start (`HIVE`). Once the
  **Honeypot** is out, the swarm follows him wherever he goes. After he has
  been neutralized, the bees are free and wander the country. The Honeypot
  never hides indoors and always arrives 110-240 units from the bees' tree. The **farmyard** sits beside the
  Mining Farm: a mud puddle (a brown dotted blob roughly 84 × 62 world units,
  with a wobbling outline and a few separate blots around it) at the first
  offset around the building that is clear
  of its footprint, door, guide and the roads; tile generation keeps props
  and patches out of the yard so nothing overlaps it. **Pigs spawn in the
  puddle** and wander the yard around it, turning back once they roam more
  than about 170 units from its centre; **roosters and hens** live
  on the opposite side of the Mining Farm (the puddle's mirror image across
  the building, `YARD`), peck within about 160 units of it, gather into one
  flock every so often, and now and then one crosses to the pigs' puddle for
  a visit of 8-14 s before drifting home. **Frogs live at the Mining Pool** (below): they spawn in
  or around it, hop through its water (which blocks everyone else) and turn
  back when they stray past its banks. A caught animal never respawns; a killed one
  returns **60 s** after the kill, always for a chance-100 species and by its
  chance (re-rolled each minute) otherwise. Outlaws
  spawn at least 260 world units from the player and animals 140. Each runs a
  simple wander-pause-wander loop, plus species behaviour: cats come over and
  bolt, dogs trot to a nearby Friend and sit, herds drift back together, an
  ostrich buries its head while the Friend is within 120 units, lions, bears
  and the fox keep away, frogs hop, snakes wiggle, birds and butterflies fly
  over obstacles with a ground shadow, and the dragon circles high, dives on
  the Friend, breathes harmless fire and climbs away. NPCs are one-bit pixel
  masks authored for this game (the hooded criminal outlaw with a shadowed
  face, and every animal in `index.tsx`) drawn like the
  Friend (black outline, no halo) at a per-species cell size (3 px for the tiny
  rabbit, frog, bird and butterfly, 4 px for cat and snake, 5 px for the rest;
  cow, lion and bear use 20-cell masks and the dragon 24). Every animal gets
  automatic depth: body cells along the underside and shadow side are drawn
  in a darker tone (a black dither on white animals, a 60% shade of the body
  colour on coloured ones). Frogs, birds and butterflies are white with one
  random accent colour each (eye ridges and mouth on the frog, wing tips,
  tail and crest on the bird, wing spots and veins on the butterfly); the fox
  is golden, the lion a worn greyed yellow with an orange mane, the bear
  brown. All are depth-sorted with the props and the Friend.
- **Warning arrows:** an outlaw within 420 world units that is off-screen gets
  a pulsing red arrow on the window edge pointing toward it (MSX style).
- **Laser bolts:** with the Laser Gun equipped, `Space` in the world fires a
  bolt along the Friend's facing (an aim assist snaps to an outlaw within
  about 26° of that direction). It leaves the equipped gun's emitter (not the
  Friend's body) as a barrel-sized red comet:
  a white-hot head in a red glow, a tapering tail, pink energy wisps and
  sparks, drawn head-first along the direction of travel. It travels at
  **twice an outlaw's speed** (`SHOT_SPEED`, 150 native px/s), fades after
  `SHOT_RANGE` (800 native px) or at the world edge, and winging an outlaw
  (`SHOT_HIT`, 12 world units) is a hit (see "Taking a hacker down"). A world shot
  **spends one charge immediately with no prompt**: it is simulated, deducted
  from the visible charge count (`snapshot.consumables − fired`) in this
  component, because the SDK bridge can only consume a charge through
  `client.play`, which the runtime always confirms, and the design is one
  confirmation at purchase then free shooting.
- **Robbery:** walking into an outlaw (14 world units) no longer starts a
  wallet: it takes one random item from your inventory (a net or a captured
  animal, returned when it is defeated; the Laser Gun stays with you because its charges live in the SDK
  ledger) with the message "Ouch, *name* took *item* from you", then
  3 s of immunity. The outlaw carries the loot and it all comes back the
  moment that outlaw is defeated. Bumping a standing player takes nothing.
- **Taking a hacker down:** a bolt that reaches a hacker's hitbox is a hit
  (anything else is a miss). A hacker drops once it has taken its tier's hits:
  1 for the Rugpuller, 2 for tiers 2-4, 3 for tiers 5-11, 5 for The Liquidator (`OUTLAW_HITS_BY_TIER`);
  a winged hacker staggers and keeps moving. Down, it lies on its side, stops
  robbing and cannot be shot again, and a dialog opens titled "*Name* is
  neutralized!" with "Among his belongings you find the following items:"
  then, each with **Impound**: its keepsake (see Keepsakes), in its rarity's colour with a rarity tag; sometimes a Butterfly
  Net (5% from any outlaw); each item it stole from you, one row each, grey with a "Stolen Item" tag; and last its **Hardware
  Wallet** (Pumper and Dumper half each), in red with a "Unique" tag. Impounding puts the thing in your inventory. The wallet
  comes last because impounding it trips the kill switch and ends the list: once the wallet is hacked the outlaw is taken in,
  with anything you left on him. Outlaws carry no other fixed items. **Leave it** at the bottom
  closes the dialog: the hacker stays down on the floor for a minute
  (`OUTLAW_DOWN_MS`) with whatever you left, then gets back up; walking into
  it while it is down reopens the list. Once you have impounded anything from
  a hacker (looted it), it never gets back up. That includes Pumper and Dumper
  after you take their wallet halves: they stay down until the combined
  wallet is hacked.
- **The kill switch:** impounding the Hardware Wallet shows a red warning,
  "You take the hardware wallet but triggered a kill switch, hack the device
  now or lose everything on it.", with **Hack now** (straight to the puzzle)
  and **Heck no**, which shows "Voice command 'Hack Now' received,
  proceeding" for 3 s (`VOICE_MS`) and then starts the puzzle anyway.
  **Pumper & Dumper** split one wallet. Pumper carries its top half and
  Dumper its bottom half, and each half is listed as "not hackable on its
  own". Impounded halves go into the inventory and cannot be robbed. Once
  both are in, a **Combine** button appears in the second outlaw's dialog
  and in the inventory. Combining uses up the halves and trips the kill
  switch as usual, and the hack uses the Pumper & Dumper tier. Winning,
  losing or giving up takes both outlaws in. Whatever either of them stole and
  you did not impound goes with them. The next wave comes after that.
  The Exit Scammer is the exception. His second button reads **Exit**, and
  pressing it shows the red message "You were exit scammed, what did you
  think was going to happen?!". No puzzle follows. He is gone with the
  wallet (and anything he stole that you did not impound), and the next outlaw on the list comes along
  9-15 s later. His poster still goes up in the Data Center.
- **The twist briefing:** before each board (in the game and on the practice page) a small dark card names the board's twist
  and teases it in a sentence or two (`TWIST_BRIEFINGS`), on purpose a little vague (enough to worry about, not exactly how it
  works) but in the board's own words: its banners (RUGPULL!!!, BUTCHERED!!!, EXIT SCAM!!!, DRAINED!!!, PUMPED!!! and DUMPED!!!,
  HONEYPOT!!!, BOTNET!!!, SYBIL ATTACK!!!, FRONT-RUN!!!, SANDWICHED!!!, PYRAMID!!!, MARGIN CALL!!!, FORCED SELLING!!!,
  FLASH CRASH!!!), programs and bars. **Start hacking**, Enter, Space or Esc closes it; until then the board is paused (the
  Sandwich bots stand still) and takes no clicks or keys. The ? page has the exact rules.
- **Hack the Hardware Wallet:** the puzzle overlay above the frozen world
  (rules in `wallet.ts`, all numbers in its `WALLET` table, one row per
  outlaw). A freshly generated isometric board on a
  raised slab, face-down tiles drawn as a navy circuit board. You start on
  its leftmost corner (the USB port) and flip face-down tiles next to
  revealed ones to find the **Secure Chip**, then break it.
  - **Readings** (empty sectors, program tiles and opened Honeypots) come
    in two kinds, so finding the chip is a deduction rather than a walk
    downhill. Most are **defender counts**, Minesweeper style: flat black
    dots laid out like a die, one per defender in the eight tiles around
    it (corners included; the chip is not counted; no dots means all eight
    are safe). Some tiles are **beacons**: a cyan pixel number, the
    chip's exact distance in steps. The board is cut into 3 × 3 blocks from
    its top-left corner and every block holds exactly two beacons, placed at
    random among the block's tiles that carry a reading (a block with fewer
    such tiles shows what it has); tiles in the leftover strips on the right
    and bottom edges of boards not a multiple of 3 wide are beacons one time
    in five. Beacons are fixed when the board is generated, not rolled as
    you uncover. Combine beacons to pin the chip down, and the counts to
    steer around defenders (`beaconSpots` in `wallet.ts` and `drawReading`). One reading in
    twenty lies: a beacon by one or two steps, a count by one.
  - **The chain and block rewards:** your chain is the longest route
    through your uncovered tiles (the USB port, empty sectors, programs and
    beaten defenders), one step at a time and never through a tile twice; a
    standing defender breaks it (`longestChain` in `wallet.ts`). Each time
    it reaches another multiple of 5 tiles it pays a **block reward** of +1
    Integrity (never above the start, never twice for the same multiple,
    even after a Rug Pull breaks the chain). One long winding path (or a
    filled-in patch) scores nearly every tile, while side branches that
    dead-end do not, and beating defenders joins stretches together. The CHAIN SIZE line bottom left shows the chain and the
    length of the next reward.
  - **Defenders** strike back when you hit them and lock the tiles around
    them; a locked tile is dimmed and marked with a flat red cross. Your
    **Power** is your damage per hit (2); **Integrity** is your health.
    A locked tile cannot be flipped at all (there is no brute force): kill
    every defender locking it first. A standing defender shows two badges
    above it: its HP in white and, just left of it, its attack (the strike-back
    it deals right now) in red; a beaten one shows neither.
    - **Firewall:** HP 6, strikes back for 2. Tough. Never placed on an edge
      tile (the outer rows and columns; a vault ring's edge tiles take
      another defender). On every board a
      Firewall you reveal raises a **Firewall line**: every face-down tile
      in a line through it, edge to edge, is locked (red crosses) while it
      stands. The line runs across the way you came: reached from the side
      (the tile before it in its row), it runs along its column; from above
      or below, along its row. Taking the Firewall down lifts the line
      (`firewallLine` and `beam` in `wallet.ts`).
    - **Tamper Alarm:** HP 3, strikes back for 4. A fuse: revealed, it
      counts down 3 moves (an orange badge) and then sounds for +3 trace,
      unless you defeat it first.
    - **Validator:** HP 4, strikes back for 2. While a revealed Validator
      stands, every standing defender on the board (the chip and Validators
      included) heals 1 HP each move, up to its maximum; more Validators do
      not heal faster. Take it down first. On screen a hit lands first (the
      HP badge drops by the full hit), then the heal: the badge ticks back
      up with a short green "+1" floating over it.
    - **Whale:** HP 3, strikes back for 8. Few HP, big hits.
    - **Secure Chip:** strikes back for 2. HP 6 on boards 1 to 4, 8 on 5 to
      8, 10 on 9 to 12. From board 7 on it sits in a **vault ring** of
      defenders.
  - **Cold Storage** is neither defender nor attacker. It cannot be
    attacked and locks nothing, but it cannot be passed (a frozen storage
    does not count as a revealed neighbour for flipping) and every reading
    within two tiles of it, a 5 × 5 square, is frozen while it stands:
    drawn as frost, whether you uncovered them before or after. Reveal
    three tiles around it and it thaws: the readings return and it becomes
    a program tile holding a random program of the board's pool, yours if
    a slot is free. From board 7 it takes one tile of the vault ring, so
    one way to the chip is thawed rather than fought; on the pyramid it is
    the only way to the apex. Its badge counts revealed neighbours toward
    the thaw. One per board from board 3, two from board 9. It never sits
    on an edge tile: not in the outer rows and columns, and on the pyramid
    not at its outline (the whole base row included).
  - **Attackers** have no HP and no attack value: each has an instant
    effect the moment you uncover it, and is then spent (drawn in greys, no
    strike back, no locks). They count in the readings around them just
    like defenders, so a count you cannot explain may be one.
    - **Difficulty Bomb:** explodes for 3 Integrity. One per board, two
      from board 5, three on the Boss.
    - **Reentrancy Attack:** the contract calls back into you for 2
      Integrity. One per board, two from board 7, three from board 9, four
      on the Boss.
    - **Hard Fork:** the chain splits: -2 Integrity, and a fresh Virus
      spawns about a board-width from you. One per board from board 3,
      except the pyramid (no Virus there).
    - **Gas Spike:** fees surge: every flip costs 2 trace for your next 2
      moves (a status line counts them down). From board 4; two from board
      7, three on the Boss.
  - **Programs** are found on face-down program tiles, which carry a
    reading like an empty sector (and can lie like one): a small one beside
    the program's icon, and a full one once the program is taken (each shows its icon
    once revealed) and held in 2 slots (3 from board 7), drawn bottom left
    just above the trace bar (the chain line sits under the Integrity bar,
    with POWER below it).
    Click a slot or press 1-3 to run one; targeted programs then take a tile
    click (Esc puts them away); right-click a slot to discard. Hovering a
    slot explains its program in the hover panel. A program you take stays
    on its tile for half a second, then floats up to its slot (it lands at once
    under reduced motion); it is loaded, and can be run, from the moment you
    take it. Found with the slots full, a program waits on its tile to be
    claimed later.
    - **Checksum:** every lying beacon you have uncovered so far (the ring
      around a Sybil fake) is marked red. Sectors you uncover afterwards are
      not checked, so a board can use several. Only the Sybil Attack board
      deals it, as readings are true everywhere else.
    - **Rollback:** the trace goes back 3, for 2 Integrity (it will not run
      on 2 Integrity or less).
    - **ICO:** the trace goes back 2, free. Dealt on every board.
    - **Flash Loan:** your next hit deals double and takes no strike back.
    - **Halving:** halves the search. The half of the board that holds the
      Secure Chip (top, bottom, left or right, picked at random; on an odd
      board the middle line belongs to both halves) shines gold for five
      seconds, then the sheen fades. Run it when you can look.
    - **Low Entropy:** a revealed defender's key weakens: its HP is halved.
      The Secure Chip counts, so it is the best target.
    - **Low Slippage:** the sandwich bots cannot hurt you for 15 seconds
      (only dealt on the Sandwich Attack board).
    - **Rob Peter to pay Paul:** one face-down empty sector on your lowest
      unsupported pyramid row is uncovered for free, no trace and no move
      of yours (only dealt on the Ponzi Scheme board, which always holds
      two). With nothing left to recruit it stays in its slot.
    - **Multisig:** the next two strike-backs are blocked.
    - **Staking:** +1 Power for the rest of the board.
    - **Block Explorer:** a face-down tile you pick shows what it holds,
      faintly (the chip included). Bigger boards give more picks from one
      program: two on 8 × 8 and 9 × 9, three on 10 × 10 and 11 × 11; the
      extra picks stay armed after the program is spent (Esc gives them up).
    - **Airdrop:** bait on a tile; every Virus heads there instead of you
      and stops to feed. Put it on a defender and the Virus chews that.
    - **Antivirus:** pick a Virus's tile; that one Virus is wiped.
  - **Honeypots** glint while face down. Inside is a program, but opening one
    pings the tracer (+2 trace) and makes every Virus lunge two steps toward
    you: a gamble every time you see one.
  - **The Virus** (a coral red circuit bug) appears about a board-width from
    the USB port and does not know where you are. It wanders, but with a
    nose for you: every other step it drifts toward the nearest tile of your
    trail, and it never doubles straight back, so it crosses the board rather
    than milling about (from the far corner it reaches you in roughly 1.3–1.6 x
    the straight-line distance). Once it finds your trail of revealed tiles it
    follows it to your **probe** (the
    last tile you acted on, outlined green). The moment your probe is on or
    next to its tile (its reach is outlined red) it bites once, hard, and
    vanishes. It bites defenders it walks onto too, for the same amount.
    It crawls from tile to tile; an Airdrop lures it and an Antivirus
    removes it.
  - **The trace** fills one step per flip (attacks
    and programs cost none) under a "TRACING..." label and bar; when it is full before the chip
    cracks (even with the chip found), the kill switch fires. **Integrity** at 0 also loses. The
    readout: Integrity and Power top left, level with the title, the program slots below them, and
    status lines (running programs, a twist's lasting effect once it has struck) above the trace, and the CHAIN SIZE line below it
    bottom left. A cracked wallet is rated 1 to 3 stars by the room left on
    the trace (3 for 35% or more, 2 for 15% or more), shown in the result,
    the practice results and on the outlaw's Data Center poster.
  - **Twists:** every outlaw's wallet bends one rule, named for the scam
    (`TWISTS` in `wallet.ts`). Only the twist's name shows beforehand, in
    the subtitle; its rule is never announced (not in the help page, the
    status lines or the hover panel). The moment one first strikes, its name appears over the board in big
    red lettering like RUGPULL!!! (`fire` in `wallet.ts`): RUGPULL!!!,
    BUTCHERED!!! (a program selected with every slot full on the Pig
    Butcher's board), EXIT
    SCAM!!!, DRAINED!!! (the first drainer trap uncovered), PUMPED!!! (your first flip)
    and DUMPED!!! (at 60% of the trace), HONEYPOT!!! (the first glint opened), BOTNET!!! (as
    the board opens), SYBIL ATTACK!!! (the first fake chip
    uncovered), FRONT-RUN!!! (the first program or block reward the Front
    Runner takes), SANDWICHED!!! (the first time the bots close on you for Integrity), PYRAMID!!!
    (the first flip that costs double), MARGIN CALL!!! (Equity at 60%), FORCED
    SELLING!!! (the first forced sale), FLASH CRASH!!! (the first crash) and
    LIQUIDATED!!! (The Liquidator reaching you).
    The practice page leaves the twist out of its summary too.
    - **Rug Pull** (Rugpuller): without warning, on move 7, 8, 9 or 10
      (equal odds, a move being a flip, attack or program run), the
      board is yanked off to the side under the RUGPULL!!! lettering
      and drops back in the same, but with every tile except the one you
      stand on face down again (the USB port too): you carry on from where
      you were, and have to remember what you saw. Your programs, trace and
      Integrity carry on; defenders keep the damage you did.
    - **Pig Butchering** (Pig Butcher): fattened first — the board holds
      eight programs and you get three slots. Selecting a program while
      every slot is full butchers you: that program never runs, your whole
      hand is gone, and you lose a slot (3 → 2). The board is untouched. It
      strikes again if you fill the two remaining slots and select a program
      (2 → 1); with a single slot it cannot strike. Run programs before your
      hand fills, or keep a slot free.
    - **Exit Scam** (Exit Scammer): at two thirds of the trace the scammer
      exits with the data: every empty sector's reading is wiped, covered or
      already uncovered (the tiles stay, showing nothing), and every program
      and Honeypot still on the board vanishes. Defenders, the chip and the
      programs already in your slots are untouched — so read the board and
      pocket what you need before flip 12.
    - **Wallet Drainer** (Wallet Drainer): two drainer traps (a wallet tipped
      over, coins spilling into a drain) lie face down at random spots on
      the board. Uncover one and the hardware wallet is drained of all its
      valuables (DRAINED!!!), and every program in your slots goes with
      them; uncover the second and it reports the valuables were already
      taken by the first. The traps carry no reading, no lock and no
      damage: the cost is your hand, so run what you hold before you go
      exploring blind.
    - **Pump and Dump** (Pumper & Dumper): pumped from your very first flip —
      your Power jumps to 4 — then dumped once the trace is 60% full: your
      Power drops to 1 for the rest of the board. Hit the defenders that
      matter early. This board always holds a Flash Loan, a Low Entropy and a
      Staking among its programs (`guaranteed` on the tier).
    - **Honeypot Farm** (Honeypot): every program on this board sits inside a
      Honeypot — nine of them and no plain program tiles — so every program
      costs +2 trace and a Virus lunge to collect.
    - **Botnet** (Black Hat Hacker): three Viruses from the start. The board
      holds eight programs: three Antivirus (each wipes one Virus of your
      choice), two Airdrops (each lures every Virus at once), and three
      others that are never Antivirus or Airdrop.
    - **Sybil Attack** (Mrs. Sybil): two fake **Red Chips** hide on the
      board, well away from the real chip and from each other. Half of the
      tiles around each fake are beacons reading the distance to the fake —
      far denser than the usual two per 3 × 3 block, so the ring says "the
      chip is here" — while the other half read ordinary defender counts.
      Uncover a fake and SYBIL ATTACK!!! shows it for what it is: a harmless
      red chip whose ring lied (a Checksum can catch those beacons). No
      other reading on any board ever lies. This board always holds two
      Halvings among its programs, each lighting up the true chip's half of
      the board.
    - **Front-Running** (Front Runner): every move is a transaction the Front
      Runner can see. At normal gas he gets his in first and takes whatever
      the move would have earned you: a program you uncover (or click to
      claim) is gone, and a block reward goes to him instead of your
      Integrity. Priority gas, toggled with `G` or the button under the
      board, costs +1 trace on every flip, attack or claim and keeps
      everything safe. Flips that earn nothing are free to leave at normal
      gas, so the board is a budget: pay to protect the moves that matter.
      The Virus moves at its usual pace.
    - **Sandwich Attack** (Sandwich Bot): the only twist on real time. Two
      sandwich bots appear at the two ends of a random row or column within
      two of your probe's (five candidates, fewer at the edge; tinted gold
      while they run it) and run at each other, 2 tiles a second. If
      your probe is on that line between them, each stops on the tile next
      to you and waits; when both are there you are sandwiched for 3
      Integrity. Move off the line before the second one arrives and they
      run on and meet. Once they meet, or both reach you, they vanish and a
      new pair appears a second later on another row or column, for as long
      as the board is open (the help page pauses them). The board always
      holds at least three **Low Slippage** programs (found nowhere else),
      each of which makes you safe from the bots for 15 seconds. The practice bot
      plays in no time at all, so its win rate ignores the bots.
    - **Ponzi Scheme** (Dr. Ponzi): the board is his pyramid. Of the 11 × 11
      grid only rows of 11, 9, 7, 5, 3 and 1 tiles exist (36 tiles), the
      widest along the board's lower-left edge (from its left point to its
      bottom point) and the apex a single tile in the middle, drawn with
      bigger tiles and centred on its own extent; the USB port is in the
      middle of the base. Each row supports the rows above once
      more than half of it is uncovered: 6, 5, 4, 3, 2 and 1 tiles. A flip's
      trace is doubled for every row below it that lacks support (×2, ×4,
      ×8…), checked afresh on every flip, so you can climb past something,
      come back down to fill a row and the penalty is gone. Each row's
      count sits at its left end, green once it supports. The chip is the
      apex, with the one tile below it as its vault ring. PYRAMID!!! fires
      on the first flip that costs double. There is no Virus on this board,
      and no Hard Fork tile either. Halving is never dealt here (the chip
      is always the apex); **Rob Peter to pay Paul**, dealt nowhere else, is the
      board's own program: at least two of its five programs shore up a row
      for free.
    - **Margin Call** (The Liquidator): on this board Integrity is called
      **Equity** and shown as a share of full, 100% down to 0% (20 points
      underneath, so 5% is a point; every readout speaks in Equity). At 60%
      Equity a **margin call** opens: right-click a program in a slot to sell
      it for +10% Equity, up to three sales a board. At 40% Equity **forced
      selling** strikes at the end of the move: every program you hold is
      sold for +5% Equity each, or, with nothing to sell, +3 trace for +10%
      Equity. It strikes once per fall to 40% (Equity must climb back above
      it first), up to three times. MARGIN CALL!!! and FORCED SELLING!!!
      each fire the first time. Two more things stalk this board. **The
      Liquidator walks:** the move your Equity is at 40% or under he appears
      on a random tile four steps from your probe, then comes one tile a move,
      through defenders and all, while you stay at or under 40%; above it he
      stands where he is. If he reaches your tile you are **liquidated**:
      Equity falls to 10% and every uncovered tile but yours is seized,
      face down again like a Rug Pull, and he leaves (to return on the next
      fall). **Flash Crash:** every eighth move the market crashes for two
      moves, announced the move before by a flickering red line: your Power
      is 1 and every strike-back and Virus bite is doubled, then it
      recovers. FLASH CRASH!!! and LIQUIDATED!!! fire the first time each.
  - **Tiers**, one per outlaw (Pumper & Dumper share the fifth). Boards grow
    every two outlaws; defender roles, programs and Viruses build up along
    the list. The trace limits were tuned with the balance simulator so the
    simulated player's win rate falls board by board (600 simulated boards each). The Integrity and damage were just rescaled (Integrity up by half, strike-backs doubled, Virus bites then halved back), so the bot win rates are pending a new simulator run. Defenders are Firewalls /
    Alarms / Validators / Whales; attackers are Difficulty Bombs / Hard
    Forks / Reentrancy Attacks / Gas Spikes; Cold is Cold Storage; specials
    are programs + Honeypots.

  | # | Outlaw | Twist | Tier | Board | Integrity | Defenders (F/A/V/W) | Attackers (B/H/R/G) | Cold | Specials | Slots | Virus (steps / bite) | Trace | Bot wins |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | 1 | Rugpuller | Rug Pull | Rookie | 7 × 7 | 10 | 1/1/0/0 | 1/0/1/0 | 0 | 4 + 0 | 2 | none | 17 | pending |
  | 2 | Pig Butcher | Pig Butchering | Novice | 7 × 7 | 12 | 1/1/0/1 | 1/0/1/0 | 0 | 8 + 1 | 3 → 2 → 1 | every 2 / 4 | 19 | pending |
  | 3 | Exit Scammer | Exit Scam | Seasoned | 7 × 7 | 13 | 1/1/1/0 | 1/1/1/0 | 1 | 5 + 1 | 2 | every 2 / 5 | 20 | pending |
  | 4 | Wallet Drainer | Wallet Drainer | Hardened | 8 × 8 | 14 | 1/2/1/1 | 1/1/1/1 | 1 | 5 + 1 | 2 | every 2 / 5 | 21 | pending |
  | 5 | Pumper & Dumper | Pump and Dump | Veteran | 8 × 8 | 15 | 2/2/1/0 | 2/1/1/1 | 1 | 6 + 1 | 2 | every 2 / 6 | 25 | pending |
  | 6 | Honeypot | Honeypot Farm | Expert | 8 × 8 | 15 | 2/2/1/1 | 2/1/1/1 | 1 | 0 + 9 | 2 | every 2 / 6 | 26 | pending |
  | 7 | Black Hat Hacker | Botnet | Elite | 9 × 9 | 20 | 2/2/1/1 | 2/1/2/2 | 1 | 8 + 1 | 3 | 3 Viruses, every 2 / 6 | 26 | pending |
  | 8 | Mrs. Sybil | Sybil Attack | Master | 9 × 9 | 19 | 2/3/1/1 | 2/1/2/2 | 1 | 6 + 1 | 3 | every move / 7 | 26 | pending |
  | 9 | Front Runner | Front-Running | Champion | 10 × 10 | 19 | 3/3/2/1 | 2/1/3/2 | 2 | 7 + 1 | 3 | every move / 7 | 26 | pending |
  | 10 | Sandwich Bot | Sandwich Attack | Legend | 10 × 10 | 19 | 3/3/2/2 | 2/1/3/2 | 2 | 7 + 1 | 3 | every move / 8 | 26 | pending |
  | 11 | Dr. Ponzi | Ponzi Scheme | Mythic | pyramid, 36 of 11 × 11 | 17 | 2/2/1/1 | 1/0/2/1 | 1 | 5 + 1 | 3 | none | 24 | pending |
  | 12 | The Liquidator | Margin Call | Boss | 11 × 11 | 20 (as Equity %) | 3/4/2/2 | 3/1/4/3 | 2 | 9 + 1 | 3 | every move / 9 | 27 | pending |

  The bot is a careful player that sees only what a player sees (and, like
  a player, remembers the readings a Rug Pull turned face down): it reads
  the beacons to guess the chip, prefers
  flips the defender counts say are probably safe, dodges the Virus's reach and
  glinting bait when it can, defuses lit alarms it can afford, runs programs
  at obvious moments (Antivirus or Airdrop when a Virus closes in, Rollback
  near the end of the trace, Halving as soon as it is held, Low Entropy,
  Multisig and Flash Loan on the chip),
  and fights only when it pays. It uses about half a
  program per board, so a player who hunts for
  programs will find the boards easier. About 1-7% of boards are lost to
  Integrity, the rest to the trace. Re-run it after changing any number:

  ```sh
  node games/rarefriend-outlaw/practice/simulate.mjs 1000
  ```

  The solvability check behind board generation ignores programs, block
  rewards and the Virus, and only weighs the nearest 11 defenders, so every
  board has a guaranteed route that fits the trace and Integrity.
- **No bounty:** hackers carry no flat reward. What you get for one is the
  haul of its hardware wallet. Anything it stole from you is among its belongings once it
  is neutralized, marked "Stolen Item", to impound back.
- **Inside the buildings:** the Data Center, Charging Station, Cold Storage
  and Mining Farm each have a door at the base of their front; walking
  against it switches to an interior scene of 2 × 2 rooms (`INTERIORS` in
  `index.tsx`, 424 × 292 units each, dimensions deliberately loose) with wall
  segments, doorways between rooms and building-specific furniture (in the Data Center a single bench in the middle of three rooms and the achievements terminal alone in the top-left one; in the Charging Station the charging terminal alone in the top-left one, then a counter and a battery bank; in the Cold
  Storage the mint terminal alone in the top-left room, a row of three glass
  cylinders of liquid nitrogen in the top-right one, holding Friends #2208, #8371 and #268812
  frozen in faint blue liquid (their art is read the first time you enter), a pallet stack in the bottom-left room, and in the
  bottom-right room The Vault's terminal alone, with an open hatch and stairs going down in the room's back corner (for show: it
  cannot be walked into); and in the Mining Farm five rows of ASIC
  racks per room, 14 units wide and grouped into one tight block (4-unit
  gaps, too narrow to walk into) in the middle of the room, 57 units clear
  either side and 40 above and below so you can walk all the way round it,
  drawn in 12-unit slices so the Friend layers correctly beside them,
  at every wall so each doorway, the entrance and the spawn spot stay
  reachable, each rack topped with fan grilles and blinking status LEDs, green with one in twenty red,
  still unless motion is reduced), all drawn as isometric boxes and all blocking
  movement; the doormat at the bottom leads back out. **25% of outlaw waves
  hole up inside one of these buildings**: outside, the friendly locals and
  the edge arrows then point at that building, and you have to go in to find
  and shoot them (laser bolts stop at walls). Animals stay outside.
- **Animal colours:** each animal's body has a faded natural colour instead of white, in the world's one-bit style: rabbits
  grey-brown or the original white (half each, picked per rabbit), a ginger-cream cat with brown tabby stripes, a tan dog and deer, a cream cow, a pink pig, a golden-brown
  rooster, a light brown hen, a warm grey bird, a green frog, an ostrich with a dark body and pinkish neck and legs, an olive
  snake, cream butterfly wings, a yellow bee and a tawny lion; their accents (ears, combs, spots, wing colours) stay, and the
  bear, Golden Fox and Dragon keep theirs (the `tint` and `accent` of each row in `ANIMALS`). Animals are drawn without a white
  halo, like the Friend, the horses and the buildings. The Friend's enclosed holes (its eyes, and the inside of an outlined body)
  are painted white, so on a horse or coloured ground they no longer show what is behind it; riding north, the horse's neck is also
  drawn at its own height behind the rider, filling the space between the rider's legs (the raised copy still shows its head).
- **Outlaw colours:** every named outlaw is coloured by part (`parts` in `OUTLAW_ART`: row and column ranges over its white cells,
  later parts winning) in a faded Western palette (`OC`) matching the villagers and buildings: skin, hats, dusters, suits, aprons
  and gear, each keeping its own accent (the Rugpuller's burgundy rug, the Pumper's green, the Liquidator's blue droplets and so on).
  Outlaws are drawn without a white halo in the world, like everything else; their wanted posters show the same colours.
- **Coloured flowers:** the SDK flowers' white petals take one exotic colour
  each (`colourFlower`), a little brighter than pastel but still faded:
  hibiscus coral, orchid magenta, bird-of-paradise orange, plumeria yellow,
  lotus pink, passionflower violet or tropical teal. A hash of the flower's position picks it, so the world looks the same
  on every load.
- **No overlapping terrain:** tile generation keeps a world-wide record of
  every prop and patch placed (seeded with the central garden's own), so
  patches keep a 16-unit gap from each other and props keep a gap sized to
  both props (a tree needs far more room than a flower) and stay off every
  patch, across tile edges too. Only the SDK's hand-authored garden tile
  keeps its designed flowers under trees and reeds in its pond.
- **Data Center terminal and achievements:** the top-left room of the Data
  Center holds only a computer terminal (a desk with a green-lit screen);
  walking into it opens **Achievements**, once per visit: the highest rank achieved (the title of your best trophy, or
  "None yet"; it is also listed as an achievement at the mint terminal), shots fired,
  outlaws neutralized (each outlaw once), bears killed and lions killed, all
  for this session.
- **Wanted wall:** every outlaw you neutralize gets a WANTED poster in the
  Data Center, with a rough red chalk cross over its portrait. Each poster is
  centred on one full 32-unit wall tile and drawn flat onto the face so it
  follows the wall's angle. The back wall fills first, left to right in the
  order you caught them, then the left wall. Corner tiles, the middle walls
  and the tiles they hide are skipped, which leaves 17 slots
  (`posterSlots` in `index.tsx`). Long names shrink until they fit the frame. Tap a poster, or stand in front of it and press **V**
  (a label says so), to see it upright in close-up; **Esc** closes it.
- **Mining Pool:** one water patch eight times a normal patch's area
  (360 × 160 world units against the usual 90-170 × 40-70) on a seeded tile
  with no building, clear of the roads and the farmyard (`POOL` in
  `index.tsx`). Its tile keeps other patches out of it and props out of a
  margin around it, and a wooden signpost at its front corner reads "Mining
  Pool" (light-brown board, black frame and lettering, on a post). Like all
  water it blocks walking. Across the country, generated trees, benches,
  planters, rocks, reeds and flowers are never placed inside a water patch.
  No road runs through a patch (each patch is tested against every segment
  of its tile's roads, bends included), and props keep the way up to every
  building's door clear.
- **Minimap:** a 156 × 104 px top-down sketch of the whole country in the
  bottom-right corner, drawn outdoors only: white with a black frame, the
  three road rows and columns as lines, the four buildings and the exchange
  as black squares (lime centre for the exchange), the Mining Pool as a black
  block, the puddle as a brown dot, parked horses, the wanted hackers as
  red dots (their hideout when inside), the current view as a faint outline
  and the Friend as a blinking lime marker (steady under reduced motion).
  The map is fogged until discovered: tiles that have never been in view are
  a fine dither with no roads, and buildings, the exchange, the pool, the
  puddle, each horse and each hacker only appear once they have been on
  screen (a hacker seen once stays tracked). Discovery resets with the
  session.
- **Outlaw Points (OP):** the simulated game currency, shown in the HUD
  beside your RF. Cracking a wallet pays OP by tier and stars (see the economy section), downing a bear or
  lion 5, any other animal 1. OP resets with the session and buys the
  Temporary Trojan Horses at the Exchange.
- **Trojan Horses:** rideable mounts (`HORSE_MASK`, 24 × 26 cells at 4 px,
  very light brown accents). Walking into one mounts it: the Friend sits on
  its back, the pair move together at 2× walking speed (walking is 240 px/s on
  screen, 4 px a frame at 60 fps; riding 480 px/s, 8 px a frame), and the horse turns
  with the Friend (the side view flipped for left; north and south use their
  own back and front views, `HORSE_NORTH_FAR/NEAR_MASK`, `HORSE_SOUTH_MASK`,
  layered around the rider). `R` dismounts and leaves the horse where you
  stand (1.5 s before it can be remounted); entering a building dismounts
  automatically and the horse waits outside. Three kinds:
  - **Permanent Trojan Horse**, 150 OP at the Centralised Exchange: a dark brown horse with a chestnut mane, unlike the white
    temporary ones. It appears beside you outside the Exchange and is yours
    for the session, waiting wherever you leave it.
  - **Temporary Trojan Horse**, 10 OP at the Exchange, stackable in the
    inventory. Press its **Mount** button in the inventory outside (it cannot be held:
    Q skips it): it appears under you, ridden at once, and vanishes from under you 30 seconds later
    (its time keeps running if you dismount).
  - **Wild temporary horses:** two stand at random walkable spots in every
    fresh world. Walk into one to ride it; its 30 seconds start then and it
    vanishes when it is up. They never go into the inventory.
  The canvas exposes `data-horses` (every horse's id, kind, position,
  whether ridden and when it expires) for checks.
- **Held items follow your facing:** the equipped item is drawn beside the
  Friend facing left/right, turned upward and *behind* the Friend facing up,
  and turned downward in front facing down.
- **Capture:** for now only butterflies are catchable, and only with the
  **Butterfly Net**, which is not sold and not owned at the start: any outlaw
  drops one 5% of the time when neutralized (`NET_DROP_CHANCE`). It is drawn
  with a wooden handle, a metal hoop holding the net's mouth and a bag of fine
  mesh. You swing it, not throw it: with it held, `Space` within 30 world
  units of a butterfly (`NET_REACH`) catches it: an "Animal
  Captured!" toast shows and a "Captured Butterfly" entry is added to the
  inventory (simulated, not RF-backed). Other animals in reach get a "cannot
  be netted" toast. Caught animals do not respawn. There is no Drop Net.
- **Shooting animals:** a world laser bolt that reaches a shootable animal
  takes one of its shots (rabbit, deer, cow, pig, ostrich and snake fall to
  one; the lion and bear need 2, the dragon 3). A felled animal lies on its
  side for 10 s, the dragon explodes, and the species returns 60 s later as
  described above. Kills pay nothing for now (ANIMALS.md lists RF rewards for
  the lion, bear and dragon, which are not implemented). Cats, dogs, birds, frogs, butterflies and the fox cannot
  be shot; bolts pass through them.
## The Cleaver

The **Cleaver** is a common keepsake of the Pig Butcher (KEEPSAKES.md). When it drops, it goes into the inventory as the
usable Cleaver rather than a keepsake row; hold it with Q like any item (it is drawn in the Friend's hand as a brown-handled grey
blade).
Space swings it at the nearest animal within 34 world units
(`CLEAVER_REACH`): one hit takes one hit point, the same as one laser bolt,
so it kills what one shot kills and a lion or bear needs two hits. It only
works on the animals ANIMALS.md marks as shootable, and it has no effect on
outlaws, standing or downed; swinging at one only says so. Like the
Butterfly Net it is a simulated, robbable item that resets on reload.

## The Squashed Gold Coin

The **Squashed Gold Coin** is the Sandwich Bot's rare (epic, purple) keepsake: a plain keepsake with no use yet, simulated and
not RF-backed.

## Headwear: the Simple Black Hat and the Red Sweatband

Two headwear keepsakes: the **Simple Black Hat**, a common drop of the Black Hat Hacker, and the **Red Sweatband**, an uncommon
drop of the Front Runner (the Black Hat Hacker's legendary **Black Hat with Gold Band** is the gold version). Like every
cosmetic keepsake they are worn from the inventory's **Wear / Take off** button: there is one headwear slot, so at most one piece
is worn at a time. Headwear is cosmetic, kept apart from the Q-cycled equipment (the Friend can wear it and hold the Laser Gun);
it can be sold, stored in The Vault or minted like any keepsake.

Both are flat one-bit masks drawn on the Friend's head in every facing.
`friendHead` finds the head as the first sprite row with a solid run of
four or more cells (ears and tufts poke up above it). The Black Hat's brim
(`BLACK_HAT_MASK`) sits on that row, centred on the run, and its crown
covers the ears; the sweatband is a red band with black ends one row lower,
across the forehead, a cell wider than the head on each side. Neither has a
white halo, which would paint a gap over the head.

## Buildings and the Exchange

Buildings are drawn without a white halo: their black outline sits straight on the ground. Outside, each is coloured by part
(`BUILDING_COLOURS`; `buildingPart` sorts the art's white cells into sign band, roof, door, windows and walls, and `bands` add
trims): the Exchange a weathered-wood storefront with a darker pediment, a faded red awning trim, pale glass windows and a dark
wood door; the Data Center pale slate with a steel door; the Charging Station warm concrete under an amber canopy and plug sign,
with a dark amber door; the Cold Storage icy with steel-blue shutter panels and door; the Mining Farm adobe with green rack
lights and a rust door. Sign bands are warm cream (the Charging Station's is its canopy); every black line stays. Each building is also a solid block
(`BUILDING_BLOCKS`): its front (art, steps and sign) is drawn flat and then sheared (`BUILDING_SHEAR`, the world's isometric
slope) so it runs along the roads like the ground does, pivoting on the front's middle; behind it, a roof face and a right side face recede up and to the right at the world's
isometric slope, 10 art cells deep, in the building's roof colour and a darker, lightly dotted side colour with black outlines (the
Charging Station has two blocks, the station and its canopy on the pillars). Its base, the art's two bottom rows, is drawn as two
stone steps (`STEP_COLOURS`) instead of flat black: each a slab with a stone front, a lighter top and a darker side receding the
same way, under the building. The collision footprint reaches back as deep, so
you cannot walk into a building's side; the door zones and exits follow the shear. A door's zone (`DOOR_BAND`) reaches well out from the steps and a little past the doorway's sides, and holding a direction key against the front counts as walking into it; the exit spot lies just beyond the zone, so stepping out and turning aside does not walk you straight back in. Setting `BUILDING_SHEAR` to 0 gives the old screen-facing fronts. Inside, each has its own faded
colours (`INTERIOR_COLOURS`): the Data Center a cool grey-blue floor with slate walls, the Charging Station warm concrete with
dusty tan, the Cold Storage icy blue-white with frosty blue-grey, the Mining Farm sandstone with adobe; the walls keep their dots
on that colour with a lighter top, furniture is warm off-white (the Mining Farm's ASIC racks steel, #9aa6b1 on top and #6c7883 on the sides, so their
fan grilles and lights stand out), and the doormat is a faded red Western rug. Ride into a building
and your horse waits in the open, a little to the left of where you come out (clear of the friendly local on the right) (not on the doorstep, where the building's footprint
could keep you out of mounting reach from some sides).
The Centralised Exchange is a hand-drawn storefront sprite (`SHOP_SPRITE`
in `index.tsx`, in the world's one-bit style, 8 px cells) in the garden tile
at world `[1372, 923]`, standing on a `terminal` prop that is kept only for
its collision footprint. A **Data Center** (flat roof and antenna, rows of
server-window slits), **Charging Station** (canopy on pillars with a charger
post over a kiosk), **Cold Storage** (vented warehouse, ribbed walls, a
snowflake) and **Mining Farm** (exhaust stacks and rows of fans), their own
sprites in `BUILDING_ART`, are placed once each at seeded empty spots in
different quarters of the 9 × 9 country — data center north-west, charging
station north-east, cold storage south-west, mining farm south-east — clear of the
roads, with the same collision arrangement; generated props and patches keep
their distance. Every building front is drawn flat like the Friend, NPCs and
props: black cells with a one-cell white halo and white fills, no extrusion.
All buildings, the exchange included, are drawn at **1.25×** their 8 px-cell
art (`BUILDING_SCALE`), rendered straight at whole 10 px cells, and their
collision footprints, door bands, exit spots, friendly locals and spacing
margins grow with them. Walking against the exchange's door opens the shop.
Each carries a **sign band** under its roof (rows listed per sprite in
`BUILDING_ART`) with the building's name lettered in bold capitals, sized to
fit the band; the exchange's sign reads "Centralised Exchange". Beside each
building stands a stationary **friendly local** (just off the building's right front corner beside the steps, in line with the sheared front, clear of the door and the way
up to it; drawn in colour without a halo: a brown bowler with a red band, a warm face and a tan duster coat) in a bowler hat with a
bobbing arrow above their head that points at the nearest living outlaw (for
Pumper & Dumper it points at either, and at the survivor once one is shot);
between waves the arrow disappears. Friendlies are not NPCs: nets and laser
bolts ignore them. A **WANTED signpost** stands in the open ground south-east of the horse's spot beside the starting point (off the road), in view
and within reading reach from where you begin and where every hack sends you back: a pole with the current outlaw wave's poster on a board, drawn from the same sprite variant
that is wandering the country (two portraits for Pumper & Dumper), each name below its portrait
frame, and, between waves, already the next outlaw's poster: it changes the moment a wave is taken in, while the next outlaw turns up a little later (none once the list is done). Tap the board, or press V close to it, to read it in a larger frame
(Esc closes it); a label says so when you stand near.

## Economy and inventory (simulated)

The Centralised Exchange sells:

| Item | Price | Backing |
| --- | --- | --- |
| Bounty Hunter licence (licence office, or from the Exchange) | 20 RF (for now; 100 RF planned) | **SDK consumable**: `client.buy(1n)` to start (one confirmation), `client.play(1n)` and `settle` when the run ends (one confirmation). One per run. |
| Laser reload (Charging Station terminal) | 1 OP a shot, up to 50 in the gun | Simulated OP; the gun comes with the licence. |
| Permanent Trojan Horse | 150 OP | Simulated. One per session; it appears beside the Friend. (For playtesting, `PLAYTEST_START_HORSE` in `index.tsx` starts every game with it, waiting left of the start; it is off in the released game.) |
| Temporary Trojan Horse | 10 OP | Simulated; stackable; 30 seconds of riding each. |

The Butterfly Net is not sold: any outlaw drops one 5% of the time when neutralized.

**Selling keepsakes.** The Exchange buys any keepsake for **Dust**: 1 OP each (`DUST_OP`), one at a time, from a "Sell keepsakes"
list below its wares. A cosmetic keepsake you sell comes off if you were wearing it and held no other.

### The Vault

The Vault lies under the Cold Storage, through the terminal in its bottom-right room. It lists what you carry and what is stored,
with **Store** and **Take** on each row, one at a time: the Butterfly Net, Cleaver and Temporary Trojan Horses, captured animals,
keepsakes, program cards, gas vouchers and Intel. Stored things are safe from outlaws, who rob only what you
carry, and are out of play until taken back: a stored program card or gas voucher is not used by your next hack, a stored
cosmetic cannot be worn (it comes off), and a stored Fattening feed sack cannot be opened. OP, the Laser Gun, the Permanent
Trojan Horse, seed words and building keys stay with you. Like everything else, The Vault empties when the
game reloads.

### Settling a licence: seed words, trophies and the Cold Wallet

A run ends when The Liquidator's wallet is settled, 3 wallets are wiped, or you retire, which you can do any time: Retire now in
the licence office, or straight at the terminal below, which then offers **Retire and settle the licence** with the seed words you
hold so far (fewer words, smaller bonuses; the run only ends once the payout's "Use" confirmation goes through). The
licence is **settled at the Data Center**: a note says so, the licence office repeats it, and the friendly locals' arrows point
to the Data Center's door until it is done. The **Licence Settlement** terminal stands alone in the Data Center's top-right room.

It shows the twelve-word seed phrase as numbered empty slots, and the seed words you recovered this run as buttons: click one to
fill in its slot (or **Fill in all**; click a filled slot to take it out). **Settle the licence** then rolls the licence's RF payout
through the SDK as before (the runtime's one "Use" confirmation; the words never change the RF, which comes from the game's table)
and pays for the words placed, however many (stopping halfway is fine):

- **OP:** 2 for the first word, 4 for the second, 6 for the third and so on (`SEED_OP_STEP`): 156 OP for all twelve. It is paid at
  once; spend it before starting a new hunt, which resets OP.
- **Head start for your next licence** (`HEAD_START_STEPS`), one step per word: +5 Laser shots, Intel, a gas voucher, +5 shots, a
  program card, Intel, a gas voucher, +5 shots, a program card, Intel, a gas voucher, +5 shots (all twelve: +20 shots, 3 Intel, 3
  gas vouchers, 2 program cards). It is added when the next licence starts (the gun still holds at most 50), then used up.
- **Trophies and titles** (`trophies.ts`): n words earn trophies 1 to n, and the best one earned gives your title: Rookie, Novice,
  Seasoned, Hardened, Veteran, Expert, Elite, Master, Champion's, Legendary, Mythical and Ultimate Trophy, for Rookie Hunter up to
  Ultimate Hunter. They stand in the **trophy hall**, the Data Center's bottom-right room: twelve pedestals in three rows of four,
  each with its trophy once earned (wood, tin, copper, iron, bronze, silver, gold, then a gold hat, an amethyst crystal and a
  diamond-crowned grand trophy; the gold and crystal ones sparkle) or its faint silhouette before; walk up to one for its name.
  Your title shows in the inventory and at the terminal.
- **Twelve words open the Cold Wallet**, a REWARDS frame with its own loot table (`COLD_WALLET_LOOT`): for now only the
  **Permanent Shiny Golden Trojan Horse**, a gold horse with twinkling sparkles that rides like the permanent one and waits beside
  the start in every hunt from then on.

The head start, the trophies (your best count) and the golden horse carry over when you start a new hunt; everything else resets
as before. All of it is simulated, pays no RF and is lost if the page reloads.

### RF: the Bounty Hunter licence

RF is a real token, so the economy is built so players **cannot profit on average**. The game's one SDK
consumable is the **Bounty Hunter licence** (`game.json`, 20 RF while testing: the runtime's preview wallet
holds exactly 20 RF, so a 100 RF licence could not be bought in preview). A licence is one **run**:

- **Start.** On load the licence office opens. Buying a licence is one runtime confirmation ("Buy bounty
  hunter licence"); the office closes and the run starts with a Laser Gun of 20 shots and 20 OP. Nothing in the run asks
  again. A licence you already hold (bought but not yet used) starts a run without buying.
- **During the run.** Shots, reloads (1 OP a shot at the Charging Station, up to 50), horses and wallets are all
  in-game, with no dialogs. Cracked wallets pay OP and loot, never RF.
- **End.** The run ends when The Liquidator's wallet is settled (cracked or wiped), when 3 wallets have been
  wiped by their kill switches, or when you retire from the licence office. Then the licence is used, the
  run's one other confirmation ("Use bounty hunter licence"), and its play is settled, revealing its **RF
  payout**, kept in your inventory to redeem (cancel that confirmation and the office offers "Reveal the payout"):

| Payout | Reward | Chance |
| --- | --- | --- |
| Empty | 0 | 50% |
| Dust | 10 RF | 30% |
| Coins | 20 RF | 13% |
| Stack | 60 RF | 5% |
| Cache | 200 RF | 1.5% |
| Vault | 1,000 RF | 0.45% |
| Jackpot | 2,000 RF | 0.05% |

  A licence returns 17.1 RF on average (85.5%; the validator reports it), so RF burns whatever the player
  does, and a Vault or Jackpot payout is shown as a **Jackpot licence** in gold. When the licence price
  moves to 100 RF, multiply every reward by five to keep the same shape.
- **New hunt.** After a run the office offers a new hunt: the country restarts (outlaws return) and the next
  licence can be bought.
- **Reloads.** Game state lives in memory. If the page reloads during a run, the run's progress is lost but
  the licence is still unused, so the office offers to start a new run with it. If a reload lands between
  using the licence and settling it, the office offers **Resolve the payout**, which settles that same play.
  One licence therefore always pays out exactly once.
- **Stake.** A licence reserves the table's top prize (2,000 RF) from the game's free stake until its run
  ends; the preview ledger holds ten top prizes, plenty for one run at a time.

### OP, wallet loot and keepsakes (simulated)

**Outlaw Points** are the soft currency. A cracked wallet pays `10 × tier` OP, times 1, 1.5 or 2 for one,
two or three stars (`walletOp`); a wiped wallet pays none. Downing a bear or lion pays 5 OP, other animals
1. OP buys reloads, horses and Temporary Trojan Horses, and never converts to RF.

One cracked wallet in 20 (`JACKPOT_WALLET_CHANCE`) is a **jackpot wallet**: "You hit the jackpot with this
wallet" in pulsing gold, triple OP, a second loot roll, and a gold frame on its
outlaw's Data Center poster.

Every cracked wallet also holds, rolled in the browser (twice for a jackpot wallet; `LOOT_ODDS`):

| Loot | Chance | What it does |
| --- | --- | --- |
| Seed phrase word | always one (two from a jackpot wallet) | Twelve words (`SEED_WORDS`); the inventory shows the phrase as it grows. What a complete phrase opens is for later. |
| Program card | 50% | Pre-loaded into your first slot when you next open a wallet. |
| Building key | 15% | **Data Center key**: every wanted outlaw is tracked on your map. **Mining Farm key**: 1 OP every 30 s, up to 60, collected when you walk into the Mining Farm. |
| Intel | 35% | Use it from the inventory: every wanted outlaw now on the map is marked on your minimap. |
| Gas voucher | 40% | Spent automatically on your next wallet: +1 trace. |
| Horse token | 30% | A Temporary Trojan Horse in your inventory. |

A cracked wallet opens the **REWARDS** frame (`rewards.tsx`) over the board: a gold REWARDS heading over
falling green code, the unlocked hardware wallet in the middle (gold-cased for a jackpot wallet, with "You
hit the jackpot with this wallet"), and every item it held around it as an icon on a halo in its rarity's
colour: green common (OP, Intel, gas vouchers), blue uncommon (seed words, program cards, horse tokens),
purple rare (building keys), gold legendary (a jackpot wallet's OP); keepsakes take their table rarity.
"Collect" or Esc closes it.

**Keepsakes:** every outlaw leaves one keepsake among their belongings when you neutralize them, to impound from the list
(it goes into the inventory then), from the table in [KEEPSAKES.md](KEEPSAKES.md): a rarity by that file's normal odds, then one of
the outlaw's items of that rarity by weight. It drops once per outlaw (one that gets back up and goes down again drops nothing
more), and Pumper and Dumper share one, dropped by whichever goes down first. Jackpot wallets add no keepsake, so the
jackpot odds column in KEEPSAKES.md is currently unused. In the belongings list the keepsake shows in its rarity's colour (the
REWARDS frame's green, blue, purple or gold): a coloured bar and a rarity tag. Keepsakes are listed in the inventory and at the Cold
Storage mint terminal. Items marked **Perk** also arm a one-off perk for your next hack: +1 Power, +1 trace, or two program tiles (Honeypots on the Honeypot Farm) shown faintly as a Block Explorer
shows them. The Pig Butcher's Fattening feed sack is sealed instead: it shows on the REWARDS frame as a
sack, waits in the inventory, and its **Open** button swaps it for a random program card (pre-loaded into
your next hack). Cosmetic keepsakes can be used from the inventory (see "Cosmetics" below).

### Cosmetics

Twenty cosmetics, drawn in `cosmetics.ts` with thin black outlines and no white halo. Each has a slot and
the Friend wears at most one per slot; the inventory lists every one you own with a button to put it on
or take it off (the last one chosen in a slot replaces the one before):

| Slot | Cosmetics | How it shows |
| --- | --- | --- |
| Head | Simple Black Hat, Red Sweatband, Black Hat with Gold Band, Honeycomb Crown | On the Friend's head row |
| Face | Pig snout mask, Paper mask, Sybil's hundred faces (a new face every 0.7 s) | Over the eyes and mouth; hidden facing away |
| Body | Butcher's apron (blue and white stripes), Black Hoodie (with hood rim, pocket and drawstrings) | Recolours the inside of the Friend's own silhouette, so it fits any Friend; the outer edge stays black |
| Back | The Original Rug, worn as a cape | Behind the Friend, over their back facing away |
| Feet | Running shoes (red, white stripe, dark sole) | The Friend's bottom rows, above its shadow |
| Off hand | Red Candle, Golden sprinter's baton, Doctor's stethoscope, The Liquidator's briefcase | The other side from the held item, behind the Friend except facing the camera |
| Laser Gun skin | The Liquidator (a huge dark cannon with a blue energy cell) | In place of the Laser Gun while it is held |
| Cleaver skin | Diamond cleaver | In place of the Cleaver while it is held |
| Pet | Bee Pet, Robot Pet | Follows a little behind you, indoors too |
| Wall | Dr. Ponzi's Medical Diploma | Framed on the Data Center's last wall slot (posters fill from the first) |

The canvas exposes `data-gear` (the slots in use) for checks.

To change the drops, edit `KEEPSAKES.md`, then regenerate the game's copy:

```bash
node games/rarefriend-outlaw/tools/keepsakes.mjs
```

It writes `keepsakes.ts` (do not edit that file by hand), checks each odds column adds up to 100%, and warns
about a **Perk** it does not recognise.

**Integration gaps (for the on-chain phase):** the bridge has one consumable at one price, so reloads, horses
and OP stay simulated; the run itself lives in game memory, so a live version should save it where a reload
cannot lose it.

## Type checking

The SDK's own `npm run typecheck` does not cover `games/`. The game has its
own configuration, which checks `index.tsx`, `wallet.ts` and the practice
page with bundler-style imports:

```sh
npx tsc -p games/rarefriend-outlaw/tsconfig.json
```

## Sound (work in progress, `sound` branch)

Spaghetti-Western sound effects, all synthesized in code with the Web Audio API in `audio.ts` (no recordings or samples): a
plucked, twangy guitar string (Karplus-Strong), a whistle with vibrato, a whip crack, wood-block hoofbeats, a mariachi trumpet and
an anvil thud and a hollow bump, through a short spring-reverb echo. The first cues: `laser` (a pew with a whistling ricochet, on every shot),
`hoof` (a galloping stride of four uneven hoofbeats, ba-da-da-DUM, every 400 ms while riding, never quite the same twice), `flip` (a guitar pluck per uncovered tile, walking an A-minor scale), `strike`
(lost Integrity in a hack: an anvil thud under a low twang), `bump` (walking into an outlaw, who robs you: a body thump and a hollow bonk), `twist` (a twist striking: whip crack, falling whistle, trembling chord) and `win` (a cracked wallet: a mariachi
flourish). Sound starts after the first click, tap or key press (browsers require it) and stops while the tab is hidden; Settings
has **Sound on** (mute) and a volume slider.

Listen without the game: build the practice pages, then open `practice/dist/sounds.html` (buttons for every cue, WAV downloads),
or render them all to `practice/dist/wav/` with `node games/rarefriend-outlaw/tools/sounds.mjs`, which also prints each cue's
length and peak level.

## Hardware Wallet practice page

`practice/` is a local developer tool for testing the hacking game on its
own. It has no world, no Friend, no economy and no wallet connection, so it
is not part of the game or a playable submission. It reuses the game's own
`WalletOverlay` and the rules in `wallet.ts`, so every board plays exactly
like the real one.

```sh
node games/rarefriend-outlaw/practice/build.mjs
```

Then open `games/rarefriend-outlaw/practice/dist/index.html` in a browser.
The build output in `dist/` is not committed.

- The page starts on Rookie. Each finished board, won, lost or given up,
  moves on to the next tier. A finished Boss board has no close button and
  stays up until you pick a tier or press **New board**.
- The tier buttons jump to any tier, and **New board** deals a fresh board
  on the current tier.
- The controls match the game: click a tile, or use the arrows or WASD
  with Enter or Space, L for the Flash Loan, and Esc to give up or move on.
- A results list shows each board's tier, outcome, flips and Integrity left.

## Rendering

The game draws into one 960 × 640 canvas. World points go through the SDK's
isometric `project`/`unproject` and are magnified **2×** around the Friend,
who stays at the centre. The camera is snapped to whole screen pixels each
frame, so the terrain and the pixel-rounded sprites step together instead
of shimmering against each other while walking. The world canvas is also
pixel-exact: when a whole number of device pixels per canvas pixel (1× or 2×
on most screens) gives a size within 3% of the space, it is drawn at that
resolution and shown at exactly that size, centred, the odd edge pixel
cropped. Stretched to the frame's 958 × 638 instead, nearest-neighbour
scaling dropped a few pixel columns and rows, and art jumped a pixel each
time it scrolled across one. On other ratios it still stretches to fit.
The Friend itself is the unmodified canonical mask at
its native 5× cell size (`drawFriend`). Each tile's terrain is rendered by the
SDK and streamed in around the player. No SVG is drawn to the canvas during
play: browsers re-rasterize an SVG image on many draws, which showed as a
regular stutter. Instead each tile's SVG is kept while within two tiles
(`EVICT_RING`) and rasterized once, while within one (`LOAD_RING`, at most nine),
into a bitmap of just the band that holds anything (`TERRAIN_CROP`, the plane
and its cliff edge, 1256 × 430 of the 1600 × 1200 image) at the view's 2×, so
it blits 1:1 and stays as crisp as the vector. Tiles arrive in threes as you
cross into a new one and each takes a few dozen ms to rasterize, so the frame
loop does one horizontal strip (a quarter) of one tile per frame; a tile whose
diamond is already on screen without a bitmap (after being sent home from a
hack) is done whole at once. Each frame blits only the part of each bitmap
inside the viewport, so a frame costs about one viewport of terrain pixels
however many tiles overlap it. The prop SVGs are rasterized once too, at
800 px, the largest size they are drawn at. The frame rate went from about
18 to a steady 60 frames a second in a headless walk-through, and the canvas's debug `data-*` attributes refresh ten times a second
rather than every frame; props are drawn separately from the SDK's `renderProp` SVGs,
rasterised once per prop type (`loadSvg`) and stamped at the prop's scale
(benches and planters are halved, see `SHRUNK_PROPS`). Buildings are flat
pre-rendered fronts with lettered signs (`buildingImage`), the outlaw and all
animals are one-bit masks (`drawMask`, any grid size, optional body tint),
laser bolts are the red comet (`drawLaserBolt`) leaving the equipped gun's
emitter, and off-screen outlaws get MSX-style edge arrows. Props, NPCs,
buildings, bolts, effects and the Friend go into one painter's list sorted by
world `x + y`. Interiors draw a floor, dot grid and doormat, then walls and
furniture as isometric boxes (`drawBox`: white top, dithered sides, black
outline) lifted 40 and 14 units. The hardware wallet is a separate overlay canvas: a 2:1 isometric 7 × 7 to 11 × 11
board on a dithered slab, hatched face-down tiles, white revealed tiles with
defender-count dots, cyan beacon numbers or standing vector icons, a hover panel, an Integrity bar and the
deadpan log line. Unlike the pixel-art world, the wallet board is drawn at
the resolution it is shown at (its size on screen times the device pixel
ratio, up to 3), and its defender, program, USB port, Honeypot and Virus
icons are flat vector drawings with black outlines and a white halo
(`wallet-icons.ts`), so they stay sharp and carry more detail.

Movement: WASD/arrow keys move in screen directions mapped back to the world;
a tap walks in a straight screen line toward the tapped point and stops at
obstacles (no path routing). The Friend is a 5-unit collision disk sampled at
five points against the SDK's per-tile walkability plus the buildings'
footprints; NPCs use their own radius. The canvas exposes `data-*` attributes
(`x`, `y`, `scene`, `outlaws`, `animals`, `buildings`, `flags`, `loot`,
`wanted`, `shots`) for automated checks.

## Notes and limits

- **Character art:** read with `createFriendReader` from public chain data
  (no wallet required). World assets and artwork load together behind a
  loading state with a "Retry loading" control if either fails.
- **Reduced motion:** a Settings checkbox overrides the OS
  `prefers-reduced-motion: reduce` preference; the Friend uses still frames,
  NPCs stop bobbing, the wallet cursor stops pulsing and the edge arrows stop
  pulsing.
- **Scale:** the SDK terrain was authored for the 1× fixed camera, so at 2×
  the props are still a little large relative to the Friend and NPCs.
- **Memory:** at most nine terrain bitmaps (2512 × 860, about 8.6 MB each,
  so roughly 78 MB) plus the SVGs of the next ring are held at once thanks to
  streaming; the world grid is a constant
  (`GRID`) if it needs tuning. All 81 tile definitions are validated at load.
- **Not yet implemented:** audio (so there is nothing to mute) and NPC
  dialogue. The terrain is the SDK's garden preset and generated garden-style
  tiles, recoloured in Western tones. NPC randomness is browser randomness and
  presentation only; the SDK ledger decides every RF outcome.
- An owned hardwired Generations NFT is still required to reach the
  playable prototype, including this simulated preview. The component
  contains no wallet, discovery or ownership code; the runtime enforces the
  fresh eligibility check before this component mounts.
