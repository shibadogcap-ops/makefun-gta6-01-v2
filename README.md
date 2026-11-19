# makefun-gta6-01-v2

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/shibadogcap-ops/makefun-gta6-01-v2/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/shibadogcap-ops/makefun-gta6-01-v2/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

## Palm Bay Heat

PALM BAY HEAT is a top-down open-world crime sandbox set in the fictional sunset city of Palm Bay. You play Jesse Vale, a wheelman trying to make a name on the streets, running jobs for the sharp-talking fixer Marla Quinn. Every job is a chance to earn cash, stay one step ahead of the law and see how far you can push your luck in a city that never really cools down.

The world is a 4800x3200 procedurally generated city laid out on a road grid, with sun-bleached beaches, deep blue ocean and a bustling marina along the coast. Steal and drive any car you find, weaving through traffic AI and dodging pedestrians as you go. Crossing the law builds a 5-star wanted level that triggers relentless police pursuits, and getting cornered means a busted or wasted end. Shooting uses mouse aim, so every confrontation is up to how well you handle yourself behind the wheel and on foot.

The story unfolds through a 4-job chain — First Delivery, Beach Sprint, Hot Wheels and The Big Score — with repeatable delivery errands to keep the money coming in between jobs. A 90-second rampage mode lets you cut loose and chase a saved best score. Money and progress are saved in localStorage, while all sound is synthesised with WebAudio, and a minimap and HUD keep you oriented, with pause and help screens a keystroke away.

### Controls

| Input | Action |
| --- | --- |
| WASD / Arrow keys | Drive / walk |
| F | Enter / exit car, take jobs |
| Mouse | Aim |
| Left click | Shoot |
| Shift | Sprint / handbrake |
| P or Esc | Pause |
| M | Mute |
| R | Keep playing after busted / wasted |

### Tech notes

Built on vanilla JavaScript ES modules and Canvas 2D, with zero dependencies and zero network requests — fully offline. World generation is deterministic and seeded, so the city is the same every time. All sound is synthesised with WebAudio, and saves live in localStorage.

*All names, the city of Palm Bay and its story are original works. This game is not affiliated with any publisher.*

## Run it

```sh
node serve.ts
```

Open http://localhost:8080 in a desktop browser (any static file server pointed at game/ works too — the game itself is game/index.html).

---

<sub>Entered on [make.fun](https://make.fun/?ref=g2zss0a3&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
