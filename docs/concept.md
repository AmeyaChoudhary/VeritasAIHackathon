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

1. **Someone needs to see the slide.** Slow change is invisible from the inside and easy to miss from the outside. A family needs something that knows what is normal for this student and says when they have left it.
2. **Students need their words kept on the phone.** [64% of US teens use AI chatbots](https://www.pewresearch.org/internet/2025/12/09/teens-social-media-and-ai-chatbots-2025/), and [12% have used one for emotional support or advice](https://www.pewresearch.org/internet/2026/02/24/how-teens-use-and-view-ai/). Many will type what they will not say aloud, and would stop if an adult could read it.
3. **Parents need the right moment and a way in.** A parent does not need to read a phone. They need to know when a conversation and a doctor's visit would help, and how to start that conversation.

Today's tools miss all three. Monitoring apps read everything and alert a parent on a single item. Others wait for a crisis.

## What Steady is

Steady is an app on the student's phone that answers one question: is now the time to ask? It asks the student first. When the signs keep pointing the same way, it asks their parent to check in.

1. **It learns your normal.** For four weeks it learns the student's own range for sleep, contact with friends, activity and the tone of what they type.
2. **It notices a lasting shift.** One bad night changes nothing. Two weeks outside the student's own range is what counts.
3. **It asks.** Two screening questions come first. If the answers are high, six more complete the eight-question form. They come from the questionnaire doctors use.
4. **It asks a parent to check in.** After a high score, or a shift that lasts while the questions are skipped, Steady sends the linked parent a short note: what changed, for how long, and how to start the conversation. It suggests a doctor to the student.

Four rules make it safe to keep switched on:

- **The student knows it is there.** Setup says that a parent is linked and may get a note. Steady does not say when a note is sent.
- **Text never leaves the phone.** Messages are scored on the device and discarded. A note to the parent names the areas that shifted and for how long, and contains no messages, answers or scores.
- **It asks and never diagnoses.** The verdict stays with a questionnaire and a doctor.
- **Help is one tap away.** Words about self-harm bring up the [988 Lifeline](https://988lifeline.org/) at once. Words that state a plan or intent to end their life, or say they have just hurt themselves, also send the parent an urgent note at once. Other words send one if the student does not say they are safe, or if it happens again within a week. Urgent notes also go to a trusted adult outside the home, if the student names one.

When the parent is told, what each note says and what leaves the phone are set out in [Parent alerts](parent-alerts.md).

## How it decides

Steady does not hunt for alarming messages. It compares a few everyday signals with the student's own normal, and acts only on a change that lasts. The questionnaire and words about self-harm have their own triggers, set out in [Parent alerts](parent-alerts.md).

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
4. **Ask.** When two signals count, or tone plus one other, Steady asks the two questions. A score of 3 or more, or two more weeks outside, leads to the eight. A score of 10 or more on the eight sends the parent a heads-up and suggests a doctor to the student. A low score pauses asking for two weeks. If two signals stay outside for four weeks and the last two asks were skipped, the parent gets a heads-up anyway.
5. **Learn the weights.** The rule above is our baseline. A logistic regression trained on one group of Dartmouth students learns how much each signal matters, and is tested on the other group.

**If a student is already low when they start.** A range learned during a low period would treat low as normal. Steady guards against that four ways:

- **A check at the door.** Setup begins with the eight questions. A high score skips the learning weeks, sends the parent a heads-up and suggests a doctor. The eight questions then come back every two weeks, and the range starts learning once two in a row score under 10. Two skipped check-ins in a row send another heads-up.
- **Fixed limits as well as a personal range.** Some limits apply to everyone, such as averaging under six hours of sleep on school nights. The CDC's survey of high schoolers sets them.
- **Asking anyway.** The two questions come up every two months, even when nothing has shifted.
- **Slow to accept worse.** The range moves quickly toward better weeks and slowly toward worse ones, and it freezes while signals are outside it. A slide over months cannot quietly become the new normal.

We will test this directly. Some Dartmouth students scored high in their first weeks, so we can count how many the drift rule alone misses and how many these safeguards catch.

Every signal is judged against the student's own usual. A taste for sad songs is never a signal; a change in listening is. The full list of signals and model ideas is in [Signals and model ideas](signals-and-model-ideas.md).

## Where it runs

Steady has to be a phone app, because the phone is where the signals are.

- **It does not need to stay open.** The phone already records sleep and steps. Steady reads them whenever the system wakes it.
- **Typed words need a keyboard.** The only way to see what a student types across apps is a Steady keyboard that scores words as they are typed. It never sees incoming messages, and on an iPhone it cannot tell which app or person the words are for.
- **A laptop gets a browser extension.** It covers AI chatbots used in a browser, and it stops when the browser closes. Its words go through the same self-harm check.
- **Music comes from the student's own history.** Spotify lets every user download a year of their listening. Loading it gives Steady a year of normal on the first day.
- **The parent's phone gets the notes.** It pairs with the student's phone once, at setup, and receives only the notes and a daily sign that Steady is still on. A second adult, and a trusted adult the student names, can pair the same way for urgent notes.

The hackathon demo is a web page that plays this out with sample data, on the student's phone and the parent's.

## How we will build it

We will build three pieces this weekend, using open data only.

| Piece | What we build | Open data |
| --- | --- | --- |
| Timing model | Flags when a student has drifted from their own range; tested against a fixed calendar at the same number of alerts | [College Experience Study](https://www.kaggle.com/datasets/subigyanepal/college-experience-dataset): 215 Dartmouth students, up to four years of phone data and weekly mood questions |
| Text model | Reads low mood in short messages, and is small enough to run in a browser | [GoEmotions](https://huggingface.co/datasets/google-research-datasets/go_emotions): 58,000 labelled Reddit comments, plus 60 messages we write, including song lyrics and dark jokes |
| Demo | A scrolling page that follows one fictional student through twelve weeks, and her mother's phone | Sample data |

Every model is tested on data it never saw, against a simple baseline, with missed cases and false alarms reported separately. Because a note now reaches a parent, the timing model also reports how many notes a family would get in a year, and how many land in weeks when mood scores were high. Its thresholds are chosen on one group of students and frozen before the other group is scored. Full write-ups: [Experiment 1](../results/exp1/results.md) and [Experiment 2](../results/exp2/results.md).

## What we found

- **Timing (Experiment 1).** Across 213 Dartmouth students and 16,886 weeks with a mood score, 12.9% of weeks had a PHQ-2 of 3 or more. At 21 asks per student per year, 14.6% of the drift rule's asks landed on those weeks, against 12.9% for a fixed calendar. Random weeks from the same student in the same three months did as well, at 14.9%. A logistic regression scored at chance on students it never saw (AUC 0.48). Inside each student the signals move with mood in the expected direction, and the strongest correlation is about 0.12, which is too weak to pick a week.
- **A heads-up from phone signals alone.** With six weeks outside and a three-week cooldown, chosen on half the students, the other half got 2.8 heads-ups a year. 15.8% of them landed on a high week, against 15.5% for a calendar sending the same number.
- **A deeper check (Experiment 1b).** With 686 phone features and three kinds of model, using only phone data recorded before the answer, AUC was 0.57 to 0.60 on students the models never saw. A single check-in from the week before (a mood picture, stress, time with others) reached 0.69 with no phone data, and every earlier check-in together 0.74 to 0.78. With every questionnaire input at least 14 days old, earlier PHQ-2 answers plus check-ins reached 0.89, mostly because students who score high tend to stay high. Given the same answer history, adding phone data added nothing reliable. In our own data, 7% of answer pairs one to three days apart flip between high and not high, so no model can be near perfect against this label. Versions built to cheat on purpose reached 0.98. [Full write-up](../results/exp1b/results.md).
- **Words (Experiment 2).** On 5,427 Reddit comments it never saw, the tone model found 55% of low-mood comments at 52% precision. A keyword list found 24%. On our own teen-style messages it found 11 of 33. The self-harm phrase list missed 9 of 15 risk messages written blind, and flagged 4 of 24 jokes, lyric-style lines and sarcasm.
- **Asking (Experiment 3).** With every method given 12 asks per student per year, 24% of the asks chosen from one short check-in landed on a high week, against 13% for a fixed calendar and 18% for a model with every phone measure. Random weeks from the same student and quarter reached 23%, so a check-in tells Steady whom to ask and in which term, and adds about one point for the exact week. The check-in model ranked weeks better for men (AUC 0.75) than for women (0.66). [Full write-up](../results/exp3/results.md).
- **What this means for the design.** In this data the phone signals do not pick the right week, and the questionnaire carries the weight. That points to a one-tap check-in each week and the two questions on a regular schedule, with the signals as context on the chart and the heads-up resting on the answers. We have not changed the rules yet. These are college students, not high schoolers, and the label is a weekly PHQ-2.

## The hard questions

| Question | Our answer today |
| --- | --- |
| Will it work? | Not on phone signals alone, so far. In the Dartmouth data the drift rule picked weeks no better than chance, and the questionnaire does the real work. See "What we found" |
| Can a phone see depression? | Only some signs: sleep, contact, activity and tone. The questionnaire covers the rest |
| What about false alarms? | A false alarm now reaches a parent, so the bar is higher: a score of 10 or more on the eight, or four weeks of shift with the asks skipped. At most one heads-up goes out every three weeks, and it asks for a check-in and makes no diagnosis. Urgent notes are never held back |
| Will students keep it on? | We do not know. They know from setup that a parent is linked, and the parent never sees messages, answers or scores. We will show the setup screen to classmates and ask |
| What if a student in danger says nothing? | A shift that lasts while the asks are skipped sends a heads-up. Words that state a plan or intent to end their life, or say they have just hurt themselves, send an urgent note at once. Other words about self-harm send one unless the student says they are safe, and a second flag within a week sends one anyway. A student who answers low on purpose is taken at their word, and that gap remains |
| What if a lyric or a joke sets it off? | Unless the words state a plan or an act already done, one flagged message first asks the student if they are safe. We test the self-harm check on lyrics and jokes for false flags, and on messages that state real risk for misses |
| What if the parent is the danger? | For a teen who is abused, or not out at home, a note to that parent can make things worse. The trusted adult the teen names gets urgent notes too, and the help screen lists Childhelp and The Trevor Project beside 988. We have no full answer |
| Can it ship on an iPhone? | Maybe not as designed. Apple lets a keyboard use what is typed only to improve the keyboard, so the urgent path may have to live inside the keyboard or be left out |
| Is it legal? | A real product would hold health information about minors and share some of it with a parent. It needs legal review before launch, and we have not had one |

*This project is a prototype and is not medical advice. It was researched and drafted with Claude (Anthropic), and no clinician has reviewed it. Sources are linked where each figure appears; all were opened on November 14, 2026.*
