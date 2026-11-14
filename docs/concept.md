# Steady: knowing when to ask

November 14, 2026

## The problem

One in five American teenagers goes through depression in a year, and most of them get no help.

- **It is common.** In 2021, [20.1% of US adolescents had a major depressive episode](https://www.nimh.nih.gov/health/statistics/major-depression). In the CDC's 2023 survey, [39.7% of high school students reported persistent sadness](https://www.cdc.gov/mmwr/volumes/73/su/su7304a9.htm), and 20.4% had seriously considered suicide.
- **Most are never treated.** Only 40.6% of adolescents with a major depressive episode received treatment.
- **It builds where nobody is looking.** The change comes over weeks: less sleep, fewer friends, dropped activities. No single day looks alarming, so parents, teachers and the students themselves miss it.
- **The one good check is rare.** Doctors have an accurate questionnaire, but a teenager answers it only at a checkup. The [task force that recommends it](https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/screening-depression-suicide-risk-children-adolescents) says the right interval is unknown.

## What people need

These trends point to three needs that nothing meets today.

1. **Students need to see their own slide.** Slow change is invisible from the inside. A student needs something that knows what is normal for them and says when they have left it.
2. **Students need a private first step.** [64% of US teens use AI chatbots](https://www.pewresearch.org/internet/2025/12/09/teens-social-media-and-ai-chatbots-2025/), and [12% have used one for emotional support or advice](https://www.pewresearch.org/internet/2026/02/24/how-teens-use-and-view-ai/). Many will type what they will not say aloud. The next step has to begin with them, not with an adult reading their messages.
3. **Families need the right moment.** A parent does not need to read a phone. They need their child to come to them when a conversation and a doctor's visit would help.

Today's tools miss all three. They read everything and report to adults, or they wait for a crisis.

## What Steady is

Steady is an app on the student's phone that answers one question: is now the time to ask?

1. **It learns your normal.** For four weeks it learns the student's own range for sleep, contact with friends, activity and the tone of what they type.
2. **It notices a lasting shift.** One bad night changes nothing. Two weeks outside the student's own range is what counts.
3. **It asks.** Two screening questions come first, then eight more if the answers are high. They come from the questionnaire doctors use.
4. **It helps the student tell someone.** After a high score it suggests a doctor and drafts a letter to an adult the student chose. The student decides whether to send it.

Four rules make it safe to keep switched on:

- **The student owns it.** No adult can look in, and nothing is sent without the student's tap.
- **Text never leaves the phone.** Messages are scored on the device and discarded.
- **It asks and never diagnoses.** The verdict stays with a questionnaire and a doctor.
- **Help is one tap away.** Words about self-harm bring up the [988 Lifeline](https://988lifeline.org/) at once.

## How it decides

Steady does not hunt for alarming messages. It compares a few everyday signals with the student's own normal, and acts only on a change that lasts.

| Signal | What is measured each week | Symptom it stands for |
| --- | --- | --- |
| Sleep | Hours between last and first phone use; use after midnight; how regular bedtime is | Sleep problems |
| Reaching out | How often the student writes to others and at what hours, never to whom | Withdrawal, loss of interest |
| Activity and places | Steps, active days, time at home, number of places visited | Low energy, withdrawal |
| Music | How much, how late and how repetitive the listening is, and the mood of the songs | Low mood, sleep, loss of interest |
| Typing rhythm | Speed, pauses and corrections, never the words | Slowing, trouble concentrating |
| Tone | Share of the student's own messages that the text model reads as low mood | Low mood, feeling worthless |
| Calendar | Exams and events the student marks | Context only, never a trigger |

1. **Learn the normal.** For four weeks, Steady records each signal's typical value and how much it usually varies.
2. **Score each week.** Each signal gets a distance from normal in the worse direction, measured in the student's usual spread. If Maya usually sleeps 7.5 hours give or take 0.4, a week at 5.8 hours is about four spreads out.
3. **Require persistence.** A signal counts only after two weeks outside the range.
4. **Ask.** When two signals count, or tone plus one other, Steady asks the two questions. A score of 3 or more leads to the eight. A high score on the eight leads to the doctor suggestion and the letter. A low score pauses asking for two weeks.
5. **Learn the weights.** The rule above is our baseline. A logistic regression trained on one group of Dartmouth students learns how much each signal matters, and is tested on the other group.

**If a student is already low when they start.** A range learned during a low period would treat low as normal. Steady guards against that four ways:

- **A check at the door.** Setup begins with the eight questions. A high score skips the learning weeks and goes straight to suggesting a doctor and an adult. The range is learned later, once scores come down.
- **Fixed limits as well as a personal range.** Some limits apply to everyone, such as averaging under six hours of sleep on school nights. The CDC's survey of high schoolers sets them.
- **Asking anyway.** The two questions come up every two months, even when nothing has shifted.
- **Slow to accept worse.** The range moves quickly toward better weeks and slowly toward worse ones, and it freezes while signals are outside it. A slide over months cannot quietly become the new normal.

We will test this directly. Some Dartmouth students scored high in their first weeks, so we can count how many the drift rule alone misses and how many these safeguards catch.

Every signal is judged against the student's own usual. A taste for sad songs is never a signal; a change in listening is. The full list of signals and model ideas is in [Signals and model ideas](signals-and-model-ideas.md).

## Where it runs

Steady has to be a phone app, because the phone is where the signals are.

- **It does not need to stay open.** The phone already records sleep and steps. Steady reads them whenever the system wakes it.
- **Typed words need a keyboard.** The only way to see what a student types across apps is a Steady keyboard that scores words as they are typed. It never sees incoming messages, and on an iPhone it cannot tell which app or person the words are for.
- **A laptop gets a browser extension.** It covers AI chatbots used in a browser, and it stops when the browser closes.
- **Music comes from the student's own history.** Spotify lets every user download a year of their listening. Loading it gives Steady a year of normal on the first day.

The hackathon demo is a web page that plays this out with sample data.

## How we will build it

We will build three pieces this weekend, using open data only.

| Piece | What we build | Open data |
| --- | --- | --- |
| Timing model | Flags when a student has drifted from their own range; tested against asking on a fixed calendar | [College Experience Study](https://www.kaggle.com/datasets/subigyanepal/college-experience-dataset): 215 Dartmouth students, up to four years of phone data and weekly mood questions |
| Text model | Reads low mood in short messages, and is small enough to run in a browser | [GoEmotions](https://huggingface.co/datasets/google-research-datasets/go_emotions): 58,000 labelled Reddit comments, plus 60 messages we write |
| Demo | A scrolling page that follows one fictional student through twelve weeks | Sample data |

Every model is tested on data it never saw, against a simple baseline, with missed cases and false alarms reported separately. Nothing is built yet.

## The hard questions

| Question | Our answer today |
| --- | --- |
| Will it work? | We do not know yet. Phone signals may predict mood only weakly, and we will report the result either way |
| Can a phone see depression? | Only some signs: sleep, contact, activity and tone. The questionnaire covers the rest |
| What about false alarms? | The output is a private question to the student. A false alarm costs ten seconds, not a family crisis |
| Will students keep it on? | Only if it is on their side, which is why no adult can see into it |
| What if a student in danger does not tap? | That risk remains. Crisis help is always visible, and the letter can be set to send itself |

*This project is a prototype and is not medical advice. It was researched and drafted with Claude (Anthropic), and no clinician has reviewed it. Sources are linked where each figure appears; all were opened on November 14, 2026.*
