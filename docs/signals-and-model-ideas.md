# Signals and model ideas

Steady could draw on about a dozen signals, and most of them can be tested on open data. This page keeps the full list from our ideation day, so [the concept](concept.md) can stay short.

## Every signal we considered

Seven of these can be tested on open data now, and two more are worth adding to the demo.

| Signal | What we would measure | How a phone gets it | Open data to test it | Verdict |
| --- | --- | --- | --- | --- |
| Sleep | Length, timing and regularity | Phone rhythm and health records | Dartmouth data | Core |
| Phone rhythm | Unlocks and night-time use | The phone itself | Dartmouth data | Core |
| Movement | Steps, walking, time spent still | Health records | Dartmouth data | Core |
| Places | Time at home, number of places, distance; no map is kept | Location, processed on the phone | Dartmouth data | Core |
| Tone of writing | Share of the student's own messages that read as low mood | Steady keyboard | GoEmotions and our own messages | Core |
| Music: how | How much, how late, how repetitive | Listening history | Partly: Dartmouth has playback time by part of day, for iPhone users | Add |
| Calls and texts | Counts in and out, missed calls; never content | Android only | Dartmouth data, Android users | Add |
| One-tap check-ins | Pick the picture that fits your mood; alone or with others today | Asked by Steady | Dartmouth data | Add |
| Music: what | Mood of the songs against the student's usual | Listening history matched to open mood scores | None links song mood to depression over time | Demo only |
| Typing rhythm | Speed, pauses and corrections; never the words | Steady keyboard | None open | Later |
| Light | Daylight reaching the phone | Light sensor, Android | Dartmouth data, Android users | Later |
| School | Missing or late assignments | The student's own school account | None | Later |
| Voice | Pace and pauses when the student speaks to the mascot | Microphone, only when they choose | Gated sets only | Later, with care |
| Time in each app | Hours per app, late-night use | Android yes; iPhone only coarse limits | None | Context only |
| Feeds and DMs | What the student sees or receives | No way in | None | No |

**The Dartmouth data covers more than we first planned for.** [Its daily file](https://www.kaggle.com/datasets/subigyanepal/college-experience-dataset) has about 90 kinds of measurement, most of them split into night, day and evening. That includes time at home, places visited, calls, texts, light and media playback, beside the weekly mood questions.

**Typing rhythm has the best evidence among the untested signals.** In [a study of 250 phone users](https://pmc.ncbi.nlm.nih.gov/articles/PMC7647317), more severe depression went with more variable typing speed, shorter typing sessions and lower accuracy. The keyboard in that study recorded timing, not the letters typed. We have read only its abstract.

## How music fits

Music is compared with the student's own usual, so a taste for sad songs is never a signal. Only a change is.

1. **How much and when.** Total listening time, and the share of it after midnight. This is testable now: the Dartmouth data records daily playback time in three parts of the day for iPhone users.
2. **How.** Repetition, skipping, and how much new music appears. In [a study of 541 Last.fm users](https://arxiv.org/abs/2009.13685), people at greater depression risk leaned on music more and listened more repetitively.
3. **What.** The mood of the songs. [MuSe](https://zenodo.org/records/4281165) gives valence, arousal and dominance scores for 90,408 songs under CC BY 4.0, built from listener tags.

**Signals work together.** Music at 3 a.m. also says something about sleep. Listening that rises while reaching out falls points the same way as withdrawal. The model is given these combinations, not only each signal alone.

**Spotify's own tools are closed to this.** [Its developer policy](https://developer.spotify.com/policy) bans analysing Spotify content to build profiles of users, and bans feeding it into any machine learning model. Its song-mood data was also closed to new apps in 2024.

**The route that works is the student's own download.** Spotify gives every user [a year of their listening history](https://support.spotify.com/us/article/understanding-my-data/) on request, with a timestamp for each play. The lifetime version adds skips and shuffle.

**That route is better anyway.** A year of history gives Steady the student's normal on the first day, with no four-week wait. It also helps with the student who installs Steady while already low, because last month can be compared with last spring.

**Limits.**

- The download is prepared on request and does not arrive at once, so the demo will use a made-up history.
- No open dataset links song mood to depression over time. [A Bristol study of 171 students](http://ijpds.org/index.php/ijpds/article/view/3326) collected exactly that and has not said it will share it.
- One small open survey exists. [736 people described their listening and rated their own depression](https://www.kaggle.com/datasets/catherinerasgaitis/mxmh-survey-results), under CC0. It is a one-time snapshot and cannot show change.
- A real product would need Spotify's agreement or legal advice before using even the student's own download.

**What we will not do.** We will not tie a mood change to a named person. A drop after talking to one friend could just as well mean that friend is the one who listens.

## Ideas for a smarter model

Each idea is simple by itself, and eight of the nine can be tested on the Dartmouth data.

| Idea | What it does | How we would test it |
| --- | --- | --- |
| Two clocks | Compares this week with the last month and with the last six months, so it catches sudden drops and slow slides | Count the low periods caught by each clock alone and by both |
| Start typical, grow personal | In week one it compares the student with typical students; each week it trusts their own history more | Compare accuracy in a student's first month with and without it |
| Shape, not only level | Measures how regular the days are: a bedtime that wanders, routines that break | Add regularity measures and see what they gain |
| Combinations | Learns which signals matter together, such as short sleep with staying home | Compare a plain model with one that allows combinations |
| Learns which signals are true for you | Each answer the student gives teaches the model which of their signals moved first | Compare one shared model with one adjusted after a student's first few answers |
| Asks when unsure | Spends its few questions where an answer would teach it most, not only where risk looks highest | Give both approaches the same number of asks |
| Like with like | Compares a school Tuesday with other school Tuesdays; weekends and breaks have their own normal | Count false alarms around term breaks |
| Knows when it is blind | Missing data lowers confidence and never triggers an ask | The dataset records how many hours of usable data each day has |
| Shows its reasons | Every ask names the two signals that moved most | No test; this is a design rule |

**What we would build first.** Two clocks, shape and combinations go into the model. Personal learning becomes our own question for the write-up: does a model that learns from your answers beat one shared model?

**Why not build all nine.** Each one adds a setting to tune, and the Dartmouth test group has about a hundred students. A model with too many settings would fit that group by luck. Judges also expect us to explain every part.

## What a phone can and cannot see

A phone app can see the student's own habits and typed words, and almost nothing of what other people or apps show them.

| What | iPhone | Android |
| --- | --- | --- |
| Words the student types | Steady keyboard; it cannot tell which app or person | Steady keyboard |
| Messages the student receives | Impossible | Possible through notification access; we choose not to |
| Sleep and steps | Health records, with permission | Health Connect, with permission |
| Time in each app | Hidden from apps; only coarse limits such as "used after 1 a.m." | [Available with permission](https://developer.android.com/reference/android/app/usage/UsageStatsManager) |
| Calls and texts | Impossible | Restricted by Google Play rules |
| Music | The student's own download | The student's own download |
| Instagram, TikTok and Snapchat content | Only the student's own data download | Only the student's own data download |

**Closing the app changes nothing on a phone.** The phone keeps recording sleep and steps, and Steady reads them when the system wakes it. A web page on a laptop cannot do this. Closed means off.

**Apple makes a keyboard choose.** With full access off, [the system guarantees that keystrokes cannot leave the keyboard](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/CustomKeyboard.html). The keyboard then cannot pass anything to its own app either. Steady needs full access to hand over its weekly numbers, so its no-network promise would rest on open code, not on Apple.

**A keyboard never types in password fields.** The system swaps in its own keyboard there.

The iPhone rows for app time, calls and received messages come from our own knowledge of the platform. We have not tested them.
