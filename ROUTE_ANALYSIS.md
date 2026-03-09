# DhakaFlix Route Analysis

## Overview

All directories are served via **h5ai v0.29.0** file index across a `172.16.50.x` LAN subnet. Nothing about folder names or file names inside is hardcoded or predictable. Every step must:

1. **Fetch** the directory listing
2. **Search** for folder names containing the search term (case-insensitive) — this may return **multiple matches**
3. **Navigate** into the matched folder
4. At the final level, **filter for video files** (any video extension: `.mkv`, `.avi`, `.webm`, `.mp4`, etc.) and `.srt` — ignore everything else

### Search Behavior

- A search term matches against **folder names**, not file names inside
- Multiple folders may match (e.g. searching "Stree" could match both `Stree (2024)` and `Stree 2 (2024)`)
- After navigating into a matched folder, the files inside have their own unpredictable names
- Multiple video files can exist in one folder (different codecs, quality variants)
- `.srt` files may or may not be present alongside video files

---

## Category Routes

### 1. English Movies (720p)

**Server:** `172.16.50.7`

```
Step 1: GET http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/(YYYY)/
Step 2: Search listing for ALL folder names containing the search term → may return multiple matches
Step 3: User selects a matched folder
Step 4: GET that folder → filter for video files + .srt, ignore everything else
```

- Year folder format: `(YYYY)` — with parentheses
- Example: User searches "Frankenstein", year 2025
  - Step 1: Fetch `/(2025)/` → get full folder listing
  - Step 2: Search folder names for "Frankenstein" → matches: `Frankenstein (2025) 720p NF [Dual Audio]` (could be more matches if other titles contain "Frankenstein")
  - Step 3: User picks `Frankenstein (2025) 720p NF [Dual Audio]`
  - Step 4: Navigate into folder → find: `Frankenstein (2025) 720p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv`

---

### 2. English Movies (1080p)

**Server:** `172.16.50.14`

```
Step 1: GET http://172.16.50.14/DHAKA-FLIX-14/English%20Movies%20(1080p)/(YYYY)%201080p/
Step 2: Search listing for ALL folder names containing the search term → may return multiple matches
Step 3: User selects a matched folder
Step 4: GET that folder → filter for video files + .srt, ignore everything else
```

- Year folder format: `(YYYY) 1080p` — parentheses + quality suffix
- Example: User searches "Frankenstein", year 2025
  - Step 1: Fetch `/(2025) 1080p/` → get full folder listing
  - Step 2: Search folder names for "Frankenstein" → matches: `Frankenstein (2025) 1080p NF [Dual Audio]`
  - Step 3: User picks `Frankenstein (2025) 1080p NF [Dual Audio]`
  - Step 4: Navigate into folder → find: `Frankenstein (2025) 1080p NF-WEB x265 HEVC ESub [Dual Audio][Hindi 5.1+English 5.1] -HDHub.mkv`

---

### 3. Hindi Movies

**Server:** `172.16.50.14`

```
Step 1: GET http://172.16.50.14/DHAKA-FLIX-14/Hindi%20Movies/(YYYY)/
Step 2: Search listing for ALL folder names containing the search term → may return multiple matches
Step 3: User selects a matched folder
Step 4: GET that folder → filter for video files + .srt, ignore everything else
```

- Year folder format: `(YYYY)` — with parentheses
- **Can have multiple video files** in one folder (different codecs/sources)
- Example: User searches "Stree", year 2024
  - Step 1: Fetch `/(2024)/` → get full folder listing
  - Step 2: Search folder names for "Stree" → could match multiple: `Stree 2 (2024) 1080p`, or if a `Stree (2024)` existed it would also match
  - Step 3: User picks `Stree 2 (2024) 1080p`
  - Step 4: Navigate into folder → find TWO video files:
    - `Stree 2 (2024) Hindi 1080p AMZN WEBRip x264 DD5.1 ESub - mkvCinemas.mkv`
    - `Stree 2 (2024) Hindi 1080p AMZN WEBRip x265 HEVC 10bit DD5.1 ESub - HDHub4u.mkv`

---

### 4. South Indian Movies

**Server:** `172.16.50.14`

```
Step 1: GET http://172.16.50.14/DHAKA-FLIX-14/SOUTH%20INDIAN%20MOVIES/South%20Movies/YYYY/
Step 2: Search listing for ALL folder names containing the search term → may return multiple matches
Step 3: User selects a matched folder
Step 4: GET that folder → filter for video files + .srt, ignore everything else
```

- Year folder format: `YYYY` — **NO parentheses** (unlike all other movie categories)
- Extra nesting: `SOUTH INDIAN MOVIES/South Movies/` before year
- Example: User searches "Pushpa", year 2021
  - Step 1: Fetch `/2021/` → get full folder listing
  - Step 2: Search folder names for "Pushpa" → matches: `Pushpa-The Rise - Part 1 (2021) 1080p (Telugu)` (could match more if other "Pushpa" titles exist)
  - Step 3: User picks `Pushpa-The Rise - Part 1 (2021) 1080p (Telugu)`
  - Step 4: Navigate into folder → find: `Pushpa (2021) Telugu 1080p AMZN WEB-DL AVC x264 DD5.1 ESub -1TMV.mkv`

---

### 5. Animation Movies

**Server:** `172.16.50.14`

```
Step 1: GET http://172.16.50.14/DHAKA-FLIX-14/Animation%20Movies/(YYYY)/
Step 2: Search listing for ALL folder names containing the search term → may return multiple matches
Step 3: User selects a matched folder
Step 4: GET that folder → filter for video files + .srt, ignore everything else
```

- Year folder format: `(YYYY)` — with parentheses
- Example: User searches "Moana", year 2024
  - Step 1: Fetch `/(2024)/` → get full folder listing
  - Step 2: Search folder names for "Moana" → matches: `Moana 2 (2024) 720p [Dual Audio]` (a plain "Moana" search matched "Moana 2" — the folder name is not the same as the search term)
  - Step 3: User picks `Moana 2 (2024) 720p [Dual Audio]`
  - Step 4: Navigate into folder → find: `Moana 2 (2024) 720p BluRay x264 ESub [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv`

---

### 6. TV & WEB Series

**Server:** `172.16.50.12`

```
Step 1: Determine alpha group from first character of title:
        0-9 → TV Series ★  0  —  9
        A-L → TV Series ♥  A  —  L
        M-R → TV Series ♦  M  —  R
        S-Z → TV Series ♦  S  —  Z
Step 2: GET http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/{alpha group URL-encoded}/
Step 3: Search listing for ALL folder names containing the search term → may return multiple matches
Step 4: User selects a matched show folder
Step 5: GET that folder → list Season folders (ignore everything else)
Step 6: User selects a Season folder
Step 7: GET that Season folder → filter for video files + .srt, ignore everything else
```

- Alpha group URL encodings:
  - `TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209` (0-9)
  - `TV%20Series%20%E2%99%A5%20%20A%20%20%E2%80%94%20%20L` (A-L)
  - `TV%20Series%20%E2%99%A6%20%20M%20%20%E2%80%94%20%20R` (M-R)
  - `TV%20Series%20%E2%99%A6%20%20S%20%20%E2%80%94%20%20Z` (S-Z)
- Season folder names vary: `Season 1` vs `Season 01` (zero-padded) — not predictable, just read what's listed
- Episode file names are not predictable — just read what's listed
- Example: User searches "Stranger"
  - Step 1: Starts with "S" → S-Z group
  - Step 2: Fetch the S-Z listing → get full folder listing
  - Step 3: Search folder names for "Stranger" → matches MULTIPLE:
    - `Stranger Things (TV Series 2016–2025) 1080p [Dual Audio]`
    - `The Stranger (TV Mini Series 2020) 720p [Dual Audio]`
  - Step 4: User picks `Stranger Things (TV Series 2016–2025) 1080p [Dual Audio]`
  - Step 5: Navigate into folder → find: `Season 1/`, `Season 2/`, ... `Season 5/`
  - Step 6: User picks `Season 1`
  - Step 7: Navigate into Season 1 → find: `Stranger Things S01E01 1080p BluRay x265 HEVC ESub [Dual Audio][Hindi 5.1+English 5.1] -RONIN.mkv`, etc.

---

### 7. Korean TV & WEB Series

**Server:** `172.16.50.14`

```
Step 1: GET http://172.16.50.14/DHAKA-FLIX-14/KOREAN%20TV%20%26%20WEB%20Series/
Step 2: Search listing for ALL folder names containing the search term → may return multiple matches
Step 3: User selects a matched show folder
Step 4: GET that folder → list Season folders (ignore everything else)
Step 5: User selects a Season folder
Step 6: GET that Season folder → filter for video files + .srt, ignore everything else
```

- Flat listing — no alpha grouping, all shows listed directly
- **Season folder naming varies** between shows:
  - Some: `Season 1` (e.g., Squid Game)
  - Some: `Season 1 (Korean Language)` (e.g., 100 Days My Prince)
- **Episode file naming varies** between shows:
  - Some: `S01E01` format (e.g., Squid Game)
  - Some: `E01` only, no season prefix (e.g., 100 Days My Prince)
- `.srt` files confirmed present in some shows (e.g., Crash Landing on You has `.srt` alongside `.mkv`)
- Example: User searches "Crash Landing"
  - Step 1: Fetch the full Korean series listing → get all show folders
  - Step 2: Search folder names for "Crash Landing" → matches: `Crash Landing on You (TV Series 2019–2020) 1080p [Dual Audio]`
  - Step 3: User picks `Crash Landing on You (TV Series 2019–2020) 1080p [Dual Audio]`
  - Step 4: Navigate into folder → find: `Season 1/`
  - Step 5: User picks `Season 1`
  - Step 6: Navigate into Season 1 → find:
    - `Crash Landing on You S01E00 Special 720p HDTV x265 HEVC Korean Audio -NEXT.mkv`
    - `Crash Landing on You S01E00 Special 720p HDTV x265 HEVC Korean Audio -NEXT.srt`
    - `Crash Landing on You S01E01 1080p NF WEBRip x265 HEVC MSubs [Dual Audio][Korean 2.0+Hindi 2.0] -OlaM.mkv`
    - etc.

---

### 8. Foreign Language Movies > Korean Language

**Server:** `172.16.50.7`

```
Step 1: GET http://172.16.50.7/DHAKA-FLIX-7/Foreign%20Language%20Movies/Korean%20Language/
Step 2: Search listing for ALL folder names containing the search term → may return multiple matches
Step 3: User selects a matched folder
Step 4: GET that folder → filter for video files + .srt, ignore everything else
```

- Flat listing — **no year subfolders**, all movies listed directly alphabetically
- Video format varies: `.mkv`, `.avi`, `.webm`
- Some folders have **multiple video files**:
  - CD1/CD2 splits (older films with `.avi`)
  - Multiple quality variants (e.g., Parasite has both 720p + 1080p `.mkv` in one folder)
- Example: User searches "Oldboy"
  - Step 1: Fetch the full Korean Language listing → get all movie folders
  - Step 2: Search folder names for "Oldboy" → could match multiple: `Oldboy (2003) 1080p [Dual Audio]` and potentially `Oldboy (2013)` if it exists
  - Step 3: User picks `Oldboy (2003) 1080p [Dual Audio]`
  - Step 4: Navigate into folder → find: `Oldboy (2003) REM 1080p BluRay x265 HEVC ESub [Dual Audio][Hindi 5.1+Korean 5.1] -mkvC.mkv`

---

## Server Map

| Server IP | Identifier | Hosts |
|---|---|---|
| `172.16.50.7` | DHAKA-FLIX-7 | English Movies (720p), Foreign Language Movies |
| `172.16.50.14` | DHAKA-FLIX-14 | English Movies (1080p), Hindi Movies, South Indian Movies, Animation Movies, Korean TV & WEB Series |
| `172.16.50.12` | DHAKA-FLIX-12 | TV & WEB Series |

---

## Important Notes

- **`.srt` files exist** in some folders (confirmed in Korean TV: Crash Landing on You). Always check for and pick up `.srt` if present.
- **Video extensions to filter for:** `.mkv`, `.avi`, `.webm`, `.mp4`, `.m4v`, `.mov` — anything that's a video file.
- **Ignore everything else** — `.jpg`, `.png`, and any other non-video/non-srt files.
- Year folder format differs: `(YYYY)` for most, `(YYYY) 1080p` for English 1080p, bare `YYYY` for South Indian.
- For **English Movies**, always search **both** 720p (server .7) and 1080p (server .14).
- Search may return **multiple folder matches** — all should be presented.
- A single folder may contain **multiple video files** — all should be listed.

---

## Validation Results (14/14 PASS)

| Category | Title 1 | Title 2 | Status |
|---|---|---|---|
| English 720p | 28 Years Later (2025) | Oppenheimer (2023) | PASS |
| English 1080p | 28 Years Later (2025) | Oppenheimer (2023) | PASS |
| Hindi | Stree (2024) | Jawan (2023) | PASS |
| South Indian | Manjummel Boys (2024) | Pushpa (2021) | PASS |
| Animation | Inside Out (2024) | Kung Fu Panda (2024) | PASS |
| TV & WEB Series | Stranger Things (S-Z) | Dark (A-L) | PASS |
| Korean TV | Squid Game | Crash Landing on You | PASS |
| Foreign/Korean | Parasite | Oldboy | PASS |
