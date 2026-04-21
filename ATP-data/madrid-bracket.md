The 2026 Madrid Open is a 96-player Masters 1000 event, and the app represents it as a 64-slot Round of 64 bracket.

In this model:

- Seeded players occupy odd-numbered slots: 1, 3, 5, ..., 63.
- Even-numbered slots are placeholders for first-round winners: 2, 4, 6, ..., 64.
- Placeholders are expressed as exact strings of the form `Winner: Player A vs Player B`.
- Qualifier placeholders are numbered explicitly as `Q1` through `Q13`.
- Alternates such as Alex Michelsen are present in the draw but are not official seeds.

## Official Madrid 2026 draw integration

Use `src/lib/madrid-2026-data.ts` as the authoritative hardcoded draw source.
This file contains the exact official slot ordering and first-round placeholders used by the app.

### Seed and alternate notes

- Jack Draper withdrew before the draw and was replaced by Alex Michelsen.
- Michelsen appears with a bye, but he is not an official seed and should be treated as `seed: null`.

### Official first-round structure

| Match | Player 1 | Player 2 |
| --- | --- | --- |
| 1 | Jannik Sinner [1] | Bye |
| 2 | Q1 | Q2 |
| 3 | Q3 | Federico Cinà |
| 4 | Gabriel Diallo [32] | Bye |
| 5 | Cameron Norrie [19] | Bye |
| 6 | Tomáš Macháč | Francisco Comesaña |
| 7 | Roberto Bautista Agut | Thiago Agustín Tirante |
| 8 | Tommy Paul [15] | Bye |
| 9 | Andrey Rublev [9] | Bye |
| 10 | Zhang Zhizhen | Vít Kopřiva |
| 11 | Lorenzo Sonego | Q4 |
| 12 | Arthur Rinderknech [22] | Bye |
| 13 | João Fonseca [27] | Bye |
| 14 | Zizou Bergs | Marin Čilić |
| 15 | Rafael Jódar | Jesper de Jong |
| 16 | Alex de Minaur [5] | Bye |
| 17 | Ben Shelton [4] | Bye |
| 18 | Raphaël Collignon | Matteo Berrettini |
| 19 | Q5 | Sebastian Ofner |
| 20 | Tomás Martín Etcheverry [25] | Bye |
| 21 | Arthur Fils [21] | Bye |
| 22 | Ignacio Buse | Adrian Mannarino |
| 23 | Jenson Brooksby | Emilio Nava |
| 24 | Valentin Vacherot [14] | Bye |
| 25 | Jiří Lehečka [11] | Bye |
| 26 | Alejandro Tabilo | Valentin Royer |
| 27 | Alexandre Müller | Jan-Lennard Struff |
| 28 | Alex Michelsen (alternate, non-seeded) | Bye |
| 29 | Tallon Griekspoor [29] | Bye |
| 30 | Damir Džumhur | Mattia Bellucci |
| 31 | Q6 | Hubert Hurkacz |
| 32 | Lorenzo Musetti [6] | Bye |
| 33 | Alexander Bublik [8] | Bye |
| 34 | Q7 | Stefanos Tsitsipas |
| 35 | Q8 | Q9 |
| 36 | Corentin Moutet [26] | Bye |
| 37 | Alejandro Davidovich Fokina [20] | Bye |
| 38 | Pablo Carreno Busta | Márton Fucsovics |
| 39 | Jaume Munar | Alexander Shevchenko |
| 40 | Casper Ruud [12] | Bye |
| 41 | Francisco Cerúndolo [16] | Bye |
| 42 | Yannick Hanfmann | Marcos Giron |
| 43 | Daniel Altmaier | Juan Manuel Cerundolo |
| 44 | Luciano Darderi [18] | Bye |
| 45 | Brandon Nakashima [28] | Bye |
| 46 | Botic van de Zandschulp | Alexander Blockx |
| 47 | Q10 | Sebastián Báez |
| 48 | Félix Auger-Aliassime [3] | Bye |
| 49 | Daniil Medvedev [7] | Bye |
| 50 | Fábián Marozsán | Ethan Quinn |
| 51 | Q11 | Reilly Opelka |
| 52 | Denis Shapovalov [31] | Bye |
| 53 | Learner Tien [17] | Bye |
| 54 | Q12 | Grigor Dimitrov |
| 55 | Camilo Ugo Carabelli | Gaël Monfils |
| 56 | Flavio Cobolli [10] | Bye |
| 57 | Karen Khachanov [13] | Bye |
| 58 | Martín Landaluce | Adam Walton |
| 59 | Alexei Popyrin | Q13 |
| 60 | Jakub Menšík [23] | Bye |
| 61 | Ugo Humbert [30] | Bye |
| 62 | Térence Atmane | Miomir Kecmanović |
| 63 | Nuno Borges | Mariano Navone |
| 64 | Alexander Zverev [2] | Bye |

## Implementation guidance

- Treat a `Bye` match as an auto-advance condition in bracket logic.
- Keep qualifier placeholders explicit and remappable (Q1..Q13).
- Represent Alex Michelsen as a non-seeded alternate with `seed: null`.
- Use stable player IDs in the app to map results, not only player names.
- Keep this file as documentation, but rely on `src/lib/madrid-2026-data.ts` for actual bracket construction.


To implement this into your application, you need a robust data structure. Below is the full **Round of 128 (64 matches)** bracket in JSON format.

This structure is designed to be "application-ready." Each match object contains `match_id`, `round`, `player1`, `player2`, and their respective seeds. Where a player is a "Bye," the logic is explicitly defined.

### 2026 Mutua Madrid Open: Round of 128 Bracket Data

```json
{
  "tournament": "Mutua Madrid Open",
  "year": 2026,
  "round_of_128": [
    { "match_id": 1, "player1": { "name": "Jannik Sinner", "seed": 1 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 2, "player1": { "name": "Qualifier / Lucky Loser", "seed": null }, "player2": { "name": "Qualifier / Lucky Loser", "seed": null } },
    { "match_id": 3, "player1": { "name": "Qualifier / Lucky Loser", "seed": null }, "player2": { "name": "Federico Cina", "seed": null } },
    { "match_id": 4, "player1": { "name": "Gabriel Diallo", "seed": 32 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 5, "player1": { "name": "Cameron Norrie", "seed": 19 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 6, "player1": { "name": "Tomas Machac", "seed": null }, "player2": { "name": "Francisco Comesana", "seed": null } },
    { "match_id": 7, "player1": { "name": "Roberto Bautista Agut", "seed": null }, "player2": { "name": "Thiago Agustin Tirante", "seed": null } },
    { "match_id": 8, "player1": { "name": "Tommy Paul", "seed": 15 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 9, "player1": { "name": "Andrey Rublev", "seed": 9 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 10, "player1": { "name": "Zhizhen Zhang", "seed": null }, "player2": { "name": "Vit Kopriva", "seed": null } },
    { "match_id": 11, "player1": { "name": "Lorenzo Sonego", "seed": null }, "player2": { "name": "Qualifier / Lucky Loser", "seed": null } },
    { "match_id": 12, "player1": { "name": "Arthur Rinderknech", "seed": 22 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 13, "player1": { "name": "Joao Fonseca", "seed": 27 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 14, "player1": { "name": "Zizou Bergs", "seed": null }, "player2": { "name": "Marin Cilic", "seed": null } },
    { "match_id": 15, "player1": { "name": "Rafael Jodar", "seed": null }, "player2": { "name": "Jesper De Jong", "seed": null } },
    { "match_id": 16, "player1": { "name": "Alex de Minaur", "seed": 5 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 17, "player1": { "name": "Ben Shelton", "seed": 4 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 18, "player1": { "name": "Raphael Collignon", "seed": null }, "player2": { "name": "Matteo Berrettini", "seed": null } },
    { "match_id": 19, "player1": { "name": "Qualifier / Lucky Loser", "seed": null }, "player2": { "name": "Sebastian Ofner", "seed": null } },
    { "match_id": 20, "player1": { "name": "Tomas Martin Etcheverry", "seed": 25 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 21, "player1": { "name": "Arthur Fils", "seed": 21 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 22, "player1": { "name": "Ignacio Buse", "seed": null }, "player2": { "name": "Adrian Mannarino", "seed": null } },
    { "match_id": 23, "player1": { "name": "Jenson Brooksby", "seed": null }, "player2": { "name": "Emilio Nava", "seed": null } },
    { "match_id": 24, "player1": { "name": "Valentin Vacherot", "seed": 14 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 25, "player1": { "name": "Jiri Lehecka", "seed": 11 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 26, "player1": { "name": "Alejandro Tabilo", "seed": null }, "player2": { "name": "Valentin Royer", "seed": null } },
    { "match_id": 27, "player1": { "name": "Alexandre Muller", "seed": null }, "player2": { "name": "Jan-Lennard Struff", "seed": null } },
  { "match_id": 28, "player1": { "name": "Alex Michelsen", "seed": null, "alternate": true }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 29, "player1": { "name": "Tallon Griekspoor", "seed": 29 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 30, "player1": { "name": "Damir Dzumhur", "seed": null }, "player2": { "name": "Mattia Bellucci", "seed": null } },
    { "match_id": 31, "player1": { "name": "Qualifier / Lucky Loser", "seed": null }, "player2": { "name": "Hubert Hurkacz", "seed": null } },
    { "match_id": 32, "player1": { "name": "Lorenzo Musetti", "seed": 6 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 33, "player1": { "name": "Alexander Bublik", "seed": 8 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 34, "player1": { "name": "Qualifier / Lucky Loser", "seed": null }, "player2": { "name": "Stefanos Tsitsipas", "seed": null } },
    { "match_id": 35, "player1": { "name": "Qualifier / Lucky Loser", "seed": null }, "player2": { "name": "Qualifier / Lucky Loser", "seed": null } },
    { "match_id": 36, "player1": { "name": "Corentin Moutet", "seed": 26 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 37, "player1": { "name": "Alejandro Davidovich Fokina", "seed": 20 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 38, "player1": { "name": "Pablo Carreno Busta", "seed": null }, "player2": { "name": "Marton Fucsovics", "seed": null } },
    { "match_id": 39, "player1": { "name": "Jaume Munar", "seed": null }, "player2": { "name": "Alexander Shevchenko", "seed": null } },
    { "match_id": 40, "player1": { "name": "Casper Ruud", "seed": 12 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 41, "player1": { "name": "Francisco Cerundolo", "seed": 16 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 42, "player1": { "name": "Yannick Hanfmann", "seed": null }, "player2": { "name": "Marcos Giron", "seed": null } },
    { "match_id": 43, "player1": { "name": "Daniel Altmaier", "seed": null }, "player2": { "name": "Juan Manuel Cerundolo", "seed": null } },
    { "match_id": 44, "player1": { "name": "Luciano Darderi", "seed": 18 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 45, "player1": { "name": "Brandon Nakashima", "seed": 28 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 46, "player1": { "name": "Botic van de Zandschulp", "seed": null }, "player2": { "name": "Alexander Blockx", "seed": null } },
    { "match_id": 47, "player1": { "name": "Qualifier / Lucky Loser", "seed": null }, "player2": { "name": "Sebastian Baez", "seed": null } },
    { "match_id": 48, "player1": { "name": "Felix Auger-Aliassime", "seed": 3 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 49, "player1": { "name": "Daniil Medvedev", "seed": 7 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 50, "player1": { "name": "Fabian Marozsan", "seed": null }, "player2": { "name": "Ethan Quinn", "seed": null } },
    { "match_id": 51, "player1": { "name": "Qualifier / Lucky Loser", "seed": null }, "player2": { "name": "Reilly Opelka", "seed": null } },
    { "match_id": 52, "player1": { "name": "Denis Shapovalov", "seed": 31 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 53, "player1": { "name": "Learner Tien", "seed": 17 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 54, "player1": { "name": "Qualifier / Lucky Loser", "seed": null }, "player2": { "name": "Grigor Dimitrov", "seed": null } },
    { "match_id": 55, "player1": { "name": "Camilo Ugo Carabelli", "seed": null }, "player2": { "name": "Gael Monfils", "seed": null } },
    { "match_id": 56, "player1": { "name": "Flavio Cobolli", "seed": 10 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 57, "player1": { "name": "Karen Khachanov", "seed": 13 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 58, "player1": { "name": "Martin Landaluce", "seed": null }, "player2": { "name": "Adam Walton", "seed": null } },
    { "match_id": 59, "player1": { "name": "Alexei Popyrin", "seed": null }, "player2": { "name": "Qualifier / Lucky Loser", "seed": null } },
    { "match_id": 60, "player1": { "name": "Jakub Mensik", "seed": 23 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 61, "player1": { "name": "Ugo Humbert", "seed": 30 }, "player2": { "name": "Bye", "seed": null } },
    { "match_id": 62, "player1": { "name": "Terence Atmane", "seed": null }, "player2": { "name": "Miomir Kecmanovic", "seed": null } },
    { "match_id": 63, "player1": { "name": "Nuno Borges", "seed": null }, "player2": { "name": "Mariano Navone", "seed": null } },
    { "match_id": 64, "player1": { "name": "Alexander Zverev", "seed": 2 }, "player2": { "name": "Bye", "seed": null } }
  ]
}
```

### Implementation Tips for your App:

1.  **Bye Handling:** In your frontend logic, if `player2.name === "Bye"`, do not render a match input field. Instead, automatically advance `player1` to the next round.
2.  **Qualifier Logic:** Since these are placeholders, you can use an `is_placeholder` boolean flag in your database. When the qualifiers are finished, your admin panel can update these specific `match_id` entries with the actual player names.
3.  **Seeding / Alternates:** Alex Michelsen in this draw is an alternate who received the vacated bye; he is not an official seed and should be represented with `seed: null` (i.e. a non-seeded alternate). Prefer using an explicit flag such as `alternate: true` or `status: 'alternate'` so UI and scoring logic treat him differently from official seeds.
4.  **Withdrawals:** For `J. Draper (knee)`, if you need to represent his absence in the bracket, you should replace his name with "W/O" or "Replacement" in the database entry for that specific slot to ensure the bracket UI doesn't crash.