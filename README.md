# STRATA

A mining reference for **Star Citizen**. Find the best location for any ore, decode scanner signals, compare refinery yields, plan multi-stop runs, and track your inventory.

Live site: [seeknd.github.io/Strata](https://seeknd.github.io/Strata)

---

## Features

### Material Finder
Pick the ore (or ores) you want and Strata returns every location that contains them — across asteroid belts, planet surfaces, and cave systems. Filter by system, mining method (ship laser, ROC, hand-mining), and minimum yield. Each location card shows the rock types present, their composition windows, and the scanner signal you should look for.

### Location Explorer
Browse every mineable location in the system with its full ore palette, density classes, instability and resistance profiles, and which mining method is viable there.

### Signal Spectrum
Look up a scanner signal value (resistance and instability) and Strata shows you which rock types match the reading. Useful when you're staring at a prospector HUD trying to figure out if that rock is worth firing on.

### Refinery Advisor
Compare refining methods across every refinery station — efficiency, work cost, duration, and final yield per ore. Pick the station that wins for the specific ore you're hauling.

### System Map
Interactive map of the Stanton (and Pyro) systems with mining locations overlaid. Click a body to jump to its location details.

### Equipment
Reference for every mining laser, head, attachment, and modifier — with optimal-window stats, power draw, and resistance/instability modifiers.

### Inventory
Track your refined ore stockpile, export to clipboard, and link directly from a [Forge](https://seeknd.github.io/Forge) Ore Request so the ores you need are pre-selected.

---

## Data

The site loads a single `mining_data.json` at startup containing ore stats, rock compositions, scanner signals, refinery yields, equipment, and locations for the current patch. This file is updated each patch. Refinery yield data comes from the [UEX Corp API](https://uexcorp.space/).

All user data (inventory, settings) is stored in your browser's local storage — nothing is sent to a server.

---

## Tech

Pure static site — HTML, CSS, vanilla JS. No frameworks, no build tools, no server. Hosted on GitHub Pages.

---

## Related

- [Forge](https://seeknd.github.io/Forge) — crafting calculator for the RediMake Item Fabricator
- [Hardpoint](https://seeknd.github.io/Hardpoint) — ship loadout analyser
- [Wikelo](https://seeknd.github.io/Wikelo) — Banu trader reference
- [Star Citizen](https://robertsspaceindustries.com) — the game itself

---

## Disclaimer

This site is not endorsed by or affiliated with Cloud Imperium Games or Roberts Space Industries. All game content and materials are copyright Cloud Imperium Rights LLC and Cloud Imperium Rights Ltd. Star Citizen®, Squadron 42®, Roberts Space Industries®, and Cloud Imperium® are registered trademarks of Cloud Imperium Rights LLC.
