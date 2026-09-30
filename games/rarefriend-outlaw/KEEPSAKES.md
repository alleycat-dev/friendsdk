# Outlaw keepsakes: drop table (draft)

The game's loot table: edit freely (the odds, the names and the perks), then run
`node games/rarefriend-outlaw/tools/keepsakes.mjs` to regenerate `keepsakes.ts`. Every outlaw leaves one keepsake among their
belongings when you neutralize them, to impound (Pumper and Dumper share one).

Keepsakes are collectibles you keep and can later mint at the Cold Storage terminal. A few carry a
small perk, marked **Perk** below. Perks never touch RF: the contract decides every RF outcome.

Outlaws carry no fixed belongings besides their hardware wallet (Pumper and Dumper a half each). The old fixed items are
drops in this table now: the Cleaver (Pig Butcher, drops as the usable Cleaver), the Simple Black Hat (Black Hat Hacker), the
Red Sweatband (Front Runner) and the Squashed Gold Coin (Sandwich Bot). The Butterfly Net is outside this table: any outlaw
drops one 5% of the time, listed as Uncommon since any outlaw can drop it, and only while you have no net: never two.

## Rarity odds

One roll per neutralized outlaw, picked by rarity, then the outlaw's item of that rarity. Jackpot wallets add no keepsake, so
the jackpot column is currently unused.

| Rarity    | Normal wallet | Jackpot wallet |
|-----------|---------------|----------------|
| Common    | 60%           | 30%            |
| Uncommon  | 25%           | 35%            |
| Rare      | 10%           | 25%            |
| Legendary | 5%            | 10%            |

Each column must add up to 100%.

## Keepsakes per outlaw

| #   | Outlaw           | Common                                     | Uncommon                                     | Rare                                                                         | Legendary                                                                                                                   |
|-----|------------------|--------------------------------------------|----------------------------------------------|------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| 1   | Rugpuller        | Frayed rug corner                          | Rug-pull lever                               | Golden tassel                                                                | The Original Rug (wearable cape for the Friend)                                                                             |
| 2   | Pig Butcher      | Pig snout mask (cosmetic mask) / Cleaver   | Butcher's apron (wearable)                   | Fattening feed sack (**Perk**: open it in your inventory for a program card) | Diamond cleaver skin                                                                                                        |
| 3   | Exit Scammer     | Fake exit sign                             | Getaway car keys                             | Forged passport                                                              | Suitcase of wiped data (**Perk**: your next hack starts with 2 program tiles shown faintly, as a Block Explorer shows them) |
| 4   | Wallet Drainer   | Empty coin purse                           | Drain plug                                   | Siphon hose                                                                  | Bottomless wallet                                                                                                           |
| 5   | Pumper & Dumper  | Pump handle                                | Red Candle (equipable in off-hand)           | Megaphone                                                                    | Golden pump-and-dump candle trophy                                                                                          |
| 6   | Honeypot         | Honey jar                                  | Queen Bee in amber                           | Honeycomb Crown (equipable)                                                  | Bee Pet (follows you around when summoned)                                                                                  |
| 7   | Black Hat Hacker | Burner phone / Simple Black hat (wearable) | Black Hoodie (wearable)                      | Zero-day USB (**Perk**: +1 Power in your next hack)                          | Black Hat with gold band (wearable)                                                                                         |
| 8   | Mrs. Sybil       | Paper mask (cosmetic mask)                 | Mirror shard                                 | Set of forged IDs                                                            | Sybil's hundred faces (cosmetic mask)                                                                                       |
| 9   | Front Runner     | Running shoe (wearable)                    | Stopwatch / Red Sweatband (wearable)         | Priority gas token (**Perk**: next hacking game has 1 extra Trace)           | Golden sprinter's baton (equipable in off-hand))                                                                            |
| 10  | Sandwich Bot     | Club Sandwich                              | Sandwich Bot Bookends                        | Squashed Gold Coin                                                           | Robot Pet (follows you around)                                                                                              |
| 11  | Dr. Ponzi        | Pyramids of Gizah brochure                 | Doctor's stethoscope (equipable in off-hand) | Golden pyramid paperweight                                                   | Dr. Ponzi's Medical Diploma (can be hung in the Data Center)                                                                |
| 12  | The Liquidator   | Margin call notice                         | Tie clip                                     | The Liquidator's briefcase (equipable in off-hand)                           | The Liquidator (Huge gun, replacement for main hand)                                                                        |

## Notes for editing

- An outlaw can have more than one item per rarity: list them in the same cell separated by " / ", and they
  split that rarity's chance evenly (or add a share in brackets, e.g. "Hoodie (2) / Burner phone (1)").
- "Next hack" means the board of the next hardware wallet you hack (the puzzle), used up after that one board.
- Keep perks small and one-off (next hack only), so keepsakes stay collectibles first.
- Anything that would pay or change RF can only be cosmetic: RF outcomes come from the contract's table.
