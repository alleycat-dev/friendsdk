// Generated from KEEPSAKES.md by tools/keepsakes.mjs. Do not edit here: edit the Markdown, then run
//   node games/rarefriend-outlaw/tools/keepsakes.mjs
export type Rarity = "Common" | "Uncommon" | "Rare" | "Legendary";
export type KeepsakePerk = "card" | "slot" | "programs" | "power" | "trace";
export type Keepsake = { name: string; detail: string; weight: number; perk?: KeepsakePerk };
export const RARITIES: readonly Rarity[] = ["Common","Uncommon","Rare","Legendary"];
/** Chance of each rarity (in RARITIES order), in percent, for a normal and a jackpot wallet. */
export const KEEPSAKE_ODDS: Readonly<{ normal: readonly number[]; jackpot: readonly number[] }> = {"normal":[60,25,10,5],"jackpot":[30,35,25,10]};
/** Each outlaw's keepsakes by rarity (outlaws by their wanted-list name). */
export const KEEPSAKES: Readonly<Record<string, Readonly<Record<Rarity, readonly Keepsake[]>>>> = {
  "Rugpuller": {
    "Common": [
      {
        "name": "Frayed rug corner",
        "detail": "",
        "weight": 1
      }
    ],
    "Uncommon": [
      {
        "name": "Rug-pull lever",
        "detail": "",
        "weight": 1
      }
    ],
    "Rare": [
      {
        "name": "Golden tassel",
        "detail": "",
        "weight": 1
      }
    ],
    "Legendary": [
      {
        "name": "The Original Rug",
        "detail": "wearable cape for the Friend",
        "weight": 1
      }
    ]
  },
  "Pig Butcher": {
    "Common": [
      {
        "name": "Pig snout mask",
        "detail": "cosmetic mask",
        "weight": 1
      },
      {
        "name": "Cleaver",
        "detail": "",
        "weight": 1
      }
    ],
    "Uncommon": [
      {
        "name": "Butcher's apron",
        "detail": "wearable",
        "weight": 1
      }
    ],
    "Rare": [
      {
        "name": "Fattening feed sack",
        "detail": "open it in your inventory for a program card",
        "weight": 1,
        "perk": "card"
      }
    ],
    "Legendary": [
      {
        "name": "Diamond cleaver skin",
        "detail": "",
        "weight": 1
      }
    ]
  },
  "Exit Scammer": {
    "Common": [
      {
        "name": "Fake exit sign",
        "detail": "",
        "weight": 1
      }
    ],
    "Uncommon": [
      {
        "name": "Getaway car keys",
        "detail": "",
        "weight": 1
      }
    ],
    "Rare": [
      {
        "name": "Forged passport",
        "detail": "",
        "weight": 1
      }
    ],
    "Legendary": [
      {
        "name": "Suitcase of wiped data",
        "detail": "your next hack starts with 2 program tiles shown faintly, as a Block Explorer shows them",
        "weight": 1,
        "perk": "programs"
      }
    ]
  },
  "Wallet Drainer": {
    "Common": [
      {
        "name": "Empty coin purse",
        "detail": "",
        "weight": 1
      }
    ],
    "Uncommon": [
      {
        "name": "Drain plug",
        "detail": "",
        "weight": 1
      }
    ],
    "Rare": [
      {
        "name": "Siphon hose",
        "detail": "",
        "weight": 1
      }
    ],
    "Legendary": [
      {
        "name": "Bottomless wallet",
        "detail": "",
        "weight": 1
      }
    ]
  },
  "Pumper & Dumper": {
    "Common": [
      {
        "name": "Pump handle",
        "detail": "",
        "weight": 1
      }
    ],
    "Uncommon": [
      {
        "name": "Red Candle",
        "detail": "equipable in off-hand",
        "weight": 1
      }
    ],
    "Rare": [
      {
        "name": "Megaphone",
        "detail": "",
        "weight": 1
      }
    ],
    "Legendary": [
      {
        "name": "Golden pump-and-dump candle trophy",
        "detail": "",
        "weight": 1
      }
    ]
  },
  "Honeypot": {
    "Common": [
      {
        "name": "Honey jar",
        "detail": "",
        "weight": 1
      }
    ],
    "Uncommon": [
      {
        "name": "Queen Bee in amber",
        "detail": "",
        "weight": 1
      }
    ],
    "Rare": [
      {
        "name": "Honeycomb Crown",
        "detail": "equipable",
        "weight": 1
      }
    ],
    "Legendary": [
      {
        "name": "Bee Pet",
        "detail": "follows you around when summoned",
        "weight": 1
      }
    ]
  },
  "Black Hat Hacker": {
    "Common": [
      {
        "name": "Burner phone",
        "detail": "",
        "weight": 1
      },
      {
        "name": "Simple Black hat",
        "detail": "wearable",
        "weight": 1
      }
    ],
    "Uncommon": [
      {
        "name": "Black Hoodie",
        "detail": "wearable",
        "weight": 1
      }
    ],
    "Rare": [
      {
        "name": "Zero-day USB",
        "detail": "+1 Power in your next hack",
        "weight": 1,
        "perk": "power"
      }
    ],
    "Legendary": [
      {
        "name": "Black Hat with gold band",
        "detail": "wearable",
        "weight": 1
      }
    ]
  },
  "Mrs. Sybil": {
    "Common": [
      {
        "name": "Paper mask",
        "detail": "cosmetic mask",
        "weight": 1
      }
    ],
    "Uncommon": [
      {
        "name": "Mirror shard",
        "detail": "",
        "weight": 1
      }
    ],
    "Rare": [
      {
        "name": "Set of forged IDs",
        "detail": "",
        "weight": 1
      }
    ],
    "Legendary": [
      {
        "name": "Sybil's hundred faces",
        "detail": "cosmetic mask",
        "weight": 1
      }
    ]
  },
  "Front Runner": {
    "Common": [
      {
        "name": "Running shoe",
        "detail": "wearable",
        "weight": 1
      }
    ],
    "Uncommon": [
      {
        "name": "Stopwatch",
        "detail": "",
        "weight": 1
      },
      {
        "name": "Red Sweatband",
        "detail": "wearable",
        "weight": 1
      }
    ],
    "Rare": [
      {
        "name": "Priority gas token",
        "detail": "next hacking game has 1 extra Trace",
        "weight": 1,
        "perk": "trace"
      }
    ],
    "Legendary": [
      {
        "name": "Golden sprinter's baton",
        "detail": "equipable in off-hand",
        "weight": 1
      }
    ]
  },
  "Sandwich Bot": {
    "Common": [
      {
        "name": "Club Sandwich",
        "detail": "",
        "weight": 1
      }
    ],
    "Uncommon": [
      {
        "name": "Sandwich Bot Bookends",
        "detail": "",
        "weight": 1
      }
    ],
    "Rare": [
      {
        "name": "Squashed Gold Coin",
        "detail": "",
        "weight": 1
      }
    ],
    "Legendary": [
      {
        "name": "Robot Pet",
        "detail": "follows you around",
        "weight": 1
      }
    ]
  },
  "Dr. Ponzi": {
    "Common": [
      {
        "name": "Pyramids of Gizah brochure",
        "detail": "",
        "weight": 1
      }
    ],
    "Uncommon": [
      {
        "name": "Doctor's stethoscope",
        "detail": "equipable in off-hand",
        "weight": 1
      }
    ],
    "Rare": [
      {
        "name": "Golden pyramid paperweight",
        "detail": "",
        "weight": 1
      }
    ],
    "Legendary": [
      {
        "name": "Dr. Ponzi's Medical Diploma",
        "detail": "can be hung in the Data Center",
        "weight": 1
      }
    ]
  },
  "The Liquidator": {
    "Common": [
      {
        "name": "Margin call notice",
        "detail": "",
        "weight": 1
      }
    ],
    "Uncommon": [
      {
        "name": "Tie clip",
        "detail": "",
        "weight": 1
      }
    ],
    "Rare": [
      {
        "name": "The Liquidator's briefcase",
        "detail": "equipable in off-hand",
        "weight": 1
      }
    ],
    "Legendary": [
      {
        "name": "The Liquidator",
        "detail": "Huge gun, replacement for main hand",
        "weight": 1
      }
    ]
  }
};
