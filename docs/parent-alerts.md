# Parent alerts

Stability tells a parent directly when it sees a change that lasts. The student is told once, at setup, that a parent is linked. Stability does not tell the student when a note goes out. Every note asks the parent to talk with their teen, and no note contains what the teen typed or answered.

**What changed.** Earlier drafts, including [the PDF](Stability-product-concept.pdf), let the student decide whether an adult heard anything. That design accepted that a student in real danger might never tap send. We now tell the parent directly. The signals, the personal range and the two-week rule are unchanged.

**What changed after the experiments.** Our tests showed that phone signals do not pick the right week to ask (see "What the experiments now measure"). So Stability now asks first. The teen answers a two-tap check-in each week, the two questions come up once a month, and a small model asks sooner when the teen's own answers point that way. The signals are still shown to the teen and still name what changed in a note. When the parent is told has not changed.

## Setup

1. **The parent links their phone.** The parent installs the parent app and scans a code shown on the teen's phone. Setup asks them to name a second adult for urgent notes and explains why; they can skip it. It also asks them to let urgent notes sound through Do Not Disturb (Critical Alerts on iPhone, a Do Not Disturb override on Android).
2. **The parent reads what Stability misses.** Their setup screen says: "Stability will miss things. It only sees words typed on its own keyboard, and most worrying changes never send a note. No note does not mean Maya is fine. If you are worried, talk with her, and call her pediatrician or 988 any time."
3. **The teen reads one screen and taps "I understand".** On the same screen they can name a trusted adult outside the home, such as a school counselor, a relative or a coach. They can add or change this adult later in settings.
4. **The teen answers the eight questions alone,** with no parent watching.

The teen's setup screen says:

> **Stability is linked to Mom's phone.**
>
> Stability learns what's normal for you: sleep, activity, how often you message people, and the tone of what you type. Your messages never leave this phone.
>
> If something stays off for a few weeks, or your answers to its questions are high, Stability sends Mom a short note asking her to check in with you. The note can say which areas changed, like sleep, and for how long. If you type something that sounds like you might hurt yourself, Stability can send Mom an urgent note right away.
>
> Notes never include your messages, your answers or your scores. Stability won't tell you when it sends one. Mom can also see whether Stability is on and whether its keyboard is in use.
>
> If you want, name a trusted adult outside your home. Urgent notes go to them too.
>
> You can also connect your school, email, calendar, music, sleep tracker and screen time, use the Stability keyboard, and add data files from Instagram, TikTok, Snapchat, Discord or YouTube. Stability reads them on this phone. From messages and emails it reads only what you send: when, how often, and the tone. Nothing you wrote leaves this phone.
>
> Help from 988 is always one tap away.
>
> **[I understand]**

The name is whichever parent linked, and the screen also names the second adult if there is one. After setup, the teen's settings always show who is linked.

**Parent links are for students under 18.** On the student's 18th birthday the link ends, unless the student turns it back on.

On Android, Stability keeps a notification and its own icon visible while it runs, says what it does in its store listing, and declares itself a monitoring app in its manifest. [Google Play's malware policy](https://support.google.com/googleplay/android-developer/answer/9888380?hl=en) requires all of this for parental monitoring apps. The [monitoring flag](https://support.google.com/googleplay/android-developer/answer/12955211?hl=en) takes the value `child_monitoring`.

The questionnaire screens say: "Your answers stay on this phone. A high result can send Mom a note to check in." They never call the answers private.

## When Stability asks

- **The weekly check-in.** The teen's Home screen has two rows of five dots: how stressed they feel (1 not at all, to 5 extremely) and how much time they have spent alone or with others (1 almost always alone, to 5 almost always with others). Two taps. The answers stay on the phone. A check-in never sends a parent anything.
- **Once a month.** Everyone gets the two questions every four weeks, whatever the signals and check-ins show.
- **Sooner, when the ask model says so.** At the end of each week a small model scores six numbers: this week's check-in, the teen's usual check-in, their most recent score on the two questions and their average score. If the score reaches its threshold and the last ask was at least two weeks ago, the two questions come up then. The model only decides when to ask. It never sends a note.
- **Signals as a backstop.** While the teen is checking in, signals outside the range do not bring up the questions. If the teen has not checked in for two weeks, they do, as in the first design: once a week while two signals stay outside, or tone plus one other.

## When the parent is told

| State | What triggers it | What the teen sees | What the parent gets |
| --- | --- | --- | --- |
| In range | Nothing has stayed outside the student's range | A weekly note | Nothing |
| Outside range | Two signals outside the range for two weeks, or tone plus one other | What shifted. The two questions too, if the teen has stopped checking in (see "When Stability asks") | Nothing |
| Worth a check | A score of 3 or more on the two, or two more weeks outside | The other six questions, completing the eight | Nothing |
| Heads-up | A score of 10 or more on the eight, at any time including setup; or two signals outside for four weeks with the last two asks skipped | A suggestion to see a doctor, with 988 on screen. After skipped asks, the suggestion waits for the next weekly note. Nothing says a note was sent | A heads-up |
| Urgent | Words that state a plan or intent to end their life, or say they have just hurt themselves or taken something | 988 and 911 full screen, at once | An urgent note, at once |
| Urgent after asking | Other words about self-harm on the phrase list, followed by "no" to "Are you safe right now?", no answer within 30 minutes, or a second flag within 7 days | The question, with 988 full screen | An urgent note |
| Check | Words only the self-harm model flags, not the phrase list | "Are you safe right now?", with 988 full screen | Only if the teen answers "no": an urgent note at once. No answer sends nothing, and the flag does not count toward the 7-day or 14-day rules |

The rules around the table:

- **How the weeks are counted.** While signals stay outside and the teen is not checking in, Stability asks once a week. A question set left unfinished counts as skipped, whichever rule asked it. The four weeks start when the second of the two signals leaves its range. A low answer is not a skip, and it restarts the four weeks.
- **A low answer is taken at its word.** As before, a low score pauses asking for two weeks, and Stability keeps watching. Pauses in asking never pause the urgent path.
- **At most one heads-up every three weeks.** Evidence that arrives during those weeks is held. When they end, Stability checks again and sends a second heads-up if the student is still outside with asks skipped, or has had a new high score. Urgent notes are never held back.
- **Flags answered "yes" still count.** Two flags in 14 days send a heads-up, even when each was answered "yes".
- **A note never says which rule sent it.** Its timing can still give the rule away, as with a note that comes right after setup.
- **Weeks without enough data.** A week counts only if it has at least four days of usable data. A week that falls short is left out of the count. Two short weeks in a row restart it.
- **After a high score at setup.** The eight questions come back every two weeks, and the range starts learning once two in a row score under 10. If two of these check-ins in a row are skipped, the parent gets another heads-up, within the three-week limit.
- **After "Booked a doctor".** The parent app holds new heads-ups for six weeks and lists them quietly in its history. Urgent notes still sound. A clinician should set this number.
- **Turning Stability off while "Are you safe right now?" is open** counts as no answer, and the urgent note goes out before Stability stops.
- **The numbers are starting guesses.** Experiment 1 tested the four weeks and the three weeks, and no setting beat a calendar on test students (see below). The 30 minutes, the 7 days, the 14 days, the six weeks and the phrases that skip the question need a clinician. The PHQ-2 cut-off of 3 comes from a study of teenagers cited in the PDF. The PHQ-8 cut-off of 10 comes from [Kroenke and others, 2009](https://doi.org/10.1016/j.jad.2008.06.026), a survey of adults. Using either one to alert a parent is our choice, and it needs its own clinical review.

**Why most urgent flags ask first.** One flagged message could be a song lyric, a dark joke or a line from a book. Without a check, each one would reach a parent. Words that state a plan or intent to die, or say an injury or overdose has already happened, skip the question, because there a false alarm costs less than a delay. For other words, asking "Are you safe right now?" can delay a note by up to 30 minutes, and 988 stays on the student's screen the whole time. A "yes" holds the note, though a second flag within 7 days still sends it. A reassuring answer is weak evidence of safety, so a clinician should decide whether "yes" holds anything at all.

**How self-harm words are found.** This is a separate check from the tone model. The tone model reads low mood, and its training labels are emotions, which say nothing about suicide risk. In the demo the check has two parts. First a short phrase list, which decides between concern and plan. If it finds nothing, a model trained for self-harm language (Experiment 5, below) reads the message. A flag from the model alone is the "Check" row in the table: the teen is asked "Are you safe right now?" with 988 on screen, and only a "no" reaches a parent. We made it this weak on purpose. On posts labelled by psychiatrists (Experiment 5b), the model flagged nearly every person in crisis, but also most people who were only helping someone else, so it cannot tell the two apart. Neither part is clinically validated. Words typed in the browser extension go through the same two parts.

**The ninth question.** Stability uses the eight-question form because the ninth asks about thoughts of death, and the published eight-question version is meant for settings where nobody is present to respond. With a parent now in the loop, a clinician should decide whether Stability should ask it.

## What the parent receives

A heads-up after signals have shifted:

> **Worth checking in with Maya**
>
> For the past 4 weeks, Maya has been sleeping less than usual and messaging people less often. Stability can't say why, and this is not a diagnosis.
>
> **Tonight:** find a low-key moment, like a drive or cooking together, and say what you've noticed yourself. For example: "You've seemed tired lately. How are you doing?" Then listen.
>
> **Try not to:** take her phone, or push for a reason tonight.
>
> **Next:** book a visit with her pediatrician and ask about a depression screening.
>
> **If she says she isn't safe:** call or text 988. If she has hurt herself or is in immediate danger, call 911.
>
> **[We talked]  [Booked a doctor]  [Not yet]**

When a heads-up comes from a high score with no shift in the signals, as at setup, the first paragraph becomes: "Stability suggests you check in with Maya about how she has been feeling lately. This is not a diagnosis." The rest stays the same.

An urgent note:

> **Please check on Maya now**
>
> Maya typed words that may be about suicide or self-harm. Stability can't tell how serious this is. Treat it as real until you have talked with her.
>
> **Now:** go to her, stay calm, and ask her directly: "Are you thinking about suicide?" Listen without judging. Asking does not put the idea in her head.
>
> **Tonight, whatever she says:** lock up or remove medicines and any guns in the home.
>
> **If she says yes:** stay with her, and call or text 988 together.
>
> **If she says no or won't talk:** keep her close tonight, and call 988 yourself for advice.
>
> **If she has hurt herself or is in immediate danger:** call 911.
>
> **Tomorrow:** check in with her again, and call her pediatrician.
>
> **[I'm with her]  [Called 988]  [I can't reach her]**

"I can't reach her" sends the urgent note at once to the second adult and to the teen's trusted adult, if there are any. It then opens one more screen: keep trying her and anyone who may be with her, and call 911 if you believe she is in danger. An urgent note repeats every five minutes until someone taps a reply. If nobody replies within 15 minutes, it also goes to the second adult and the trusted adult. With neither named, it keeps repeating on the parent's phone.

The urgent note follows [NIMH's five action steps](https://www.nimh.nih.gov/health/publications/5-action-steps-to-help-someone-having-thoughts-of-suicide): ask, be there, help keep them safe, help them connect, and follow up. NIMH also says asking does not increase suicidal thoughts. [A 2014 review](https://www.cambridge.org/core/product/FCAEE9E5BC840D76CF10AEBECD921AC9) asked whether asking raises suicidal thoughts, and none of its 13 studies found that it did.

| In a note | Never in a note |
| --- | --- |
| Which areas shifted and for how long, when any did | Messages or typed words |
| One way to start the conversation, and what to avoid | Questionnaire answers or scores |
| The next step: a pediatrician, 988 and 911 | Places, names of people, or app names |
| For urgent notes only: that typed words may be about suicide or self-harm | |

Notes never diagnose. The heads-up suggests asking a pediatrician about depression screening. "Not yet", or no reply at all, brings a reminder in two days. Replies never reach the teen's phone.

All of this wording will be reviewed with a pediatrician and a school counselor before anyone relies on it.

## The teen's help screen

The help screen is always one tap away. It keeps "call 988" and "text 988", and adds:

- **"If you've hurt yourself or taken something, call 911."**
- **"Message Mom",** for a teen who wants to reach out first.
- **[The Trevor Project](https://www.thetrevorproject.org/),** for LGBTQ young people: call 1-866-488-7386, or text START to 678-678.
- **[The Childhelp hotline](https://www.childhelphotline.org/),** for a teen who is not safe at home: 1-800-422-4453.

## What leaves the phone

Typed text never leaves the teen's phone. Each note is one small event:

```json
{
  "type": "heads_up",
  "areas": ["sleep", "reaching_out"],
  "weeks": 4,
  "sent_at": "2026-11-14T21:30:00Z"
}
```

`type` is `heads_up`, `urgent` or `status`. `areas` and `weeks` are left out when no signal has shifted. A `status` event goes once a day and carries only the time, whether the past week had enough data (`enough_data`), and whether the Stability keyboard was used that day (`keyboard_used`).

In a real product each event is encrypted on the teen's phone. Heads-ups are encrypted for the parent's phone. Urgent events are also encrypted for the second adult's phone and the trusted adult's phone, which pair the same way. The relay that passes events on cannot read them, and deletes each one once it is delivered. When the parent taps a reply, the parent app sends a small receipt through the relay. The other adults' apps show an urgent note only if no receipt arrives within 15 minutes. Receipts never reach the teen's phone. How long the relay keeps delivery records still has to be decided. The hackathon demo has no server: the page plays every phone from sample data.

## Connected accounts

The teen connects each account on their own phone, by signing in themselves. A parent never connects them, and Stability never asks for a password. Each one has its own screen that says what it reads, with "Connect" and "Not now", and each can be disconnected in settings.

| Account | What Stability reads | What it keeps | Signal |
| --- | --- | --- | --- |
| Gmail | The teen's sent emails from the last 28 days. For each reply, the time of the message it answered. Emails the teen received are never opened. A sent reply can carry quoted or forwarded text from others: it downloads with the reply and is cut on the phone before scoring. An email whose own words can't be separated is skipped | Weekly counts: emails sent, median hours to reply, share sent after midnight, share that reads as low mood. The text is scored on the phone and dropped | Reaching out, tone |
| Google Calendar | Events from four weeks back to four weeks ahead | Whether an exam or test is coming; titles are not kept | Context only, never a trigger |
| Last.fm | Plays from the last 28 days on the public Last.fm profile the teen names, after they connect Spotify to Last.fm. Stability cannot check that the profile is theirs, because Last.fm sign-in needs a server | Weekly listening, share after midnight, how repetitive it is. The profile name is not kept | Music |
| Spotify | The teen's own Spotify data download (.zip or .json), loaded on the phone. No sign-in: Spotify's developer policy forbids building profiles of users | Weekly: song plays of 30 seconds or more, minutes, share after midnight, skips. Song names are used only to count repeats and are not kept | Music |
| Screen time | A file from the Stability screen-time app on Android, or threshold events on iPhone | Daily minutes on the phone and minutes between midnight and 5 a.m. | Sleep, late-night use |
| Google Classroom | The teen's own coursework and submissions in their classes | Weekly: assignments due, turned in late, missing, and the share turned in after midnight. Titles are not kept | School |
| Google Drive activity | When the teen edits their own files. No file names or content | Weekly: days with edits, share of edits after midnight | Late-night use |
| Microsoft 365 | Sent mail and calendar, read the same way as Gmail and Google Calendar | The same as Gmail and Google Calendar | Reaching out, tone, context |
| Canvas or Schoology | The teen's own missing and late assignments, with a token or key the teen makes in their own account settings. Both block calls from a web page (Schoology refused the browser check; Canvas says its API is for servers), so this reader runs from the phone app or a server, which is not built yet | Weekly: missing and late counts | School |
| Fitbit | Sleep and steps from the teen's Fitbit account. Google turned off Fitbit's own API in late 2026 ([Google](https://developers.google.com/health/about)); Fitbit data now comes through the Google Health API, whose scopes need Google's review. The old reader is kept for reference and will not connect | Nightly sleep hours and bedtime, daily steps | Sleep, activity |
| Health Connect (Android) | Sleep sessions and steps that the phone or a watch records | Nightly sleep hours and bedtime, daily steps | Sleep, activity |
| Stability keyboard (Android) | What the teen types, scored as they type and never stored: tone, the self-harm check, and typing rhythm (speed, pauses, corrections). The self-harm check also reads words typed and then deleted before sending | Daily: messages sent, typing speed, pauses, corrections, share that reads as low mood | Reaching out, tone, typing |
| Data files: Instagram, TikTok, Snapchat, Discord, YouTube | The export file each app gives the teen, read on the phone. Only messages the teen sent and the teen's own activity times. Other people's messages are skipped unread | Weekly: messages sent, activity after midnight, share of own messages that reads as low mood | Reaching out, tone, late-night use |

Emails and messages sent in the last 24 hours also go through the self-harm phrase list, but not the model. Older ones count only toward the weekly numbers. Each source can be disconnected in settings, and disconnecting forgets everything Stability learned from it.

**Why some sources are files.** Instagram, TikTok, Snapchat and Discord offer no way for an app to read a person's own activity or messages with their permission. Reading them automatically would mean using the teen's password or session, which breaks those apps' terms. Stability never asks for a password and never does this. YouTube no longer offers watch history through its API, so it is a file too.

**Limits we know about.** Gmail's read scopes are restricted by Google: up to 100 test users can try it before Google reviews the app, and a public launch needs Google's security assessment. School Google accounts for students under 18 block unapproved apps until the school's admin allows them ([Google](https://support.google.com/a/answer/13288950?hl=en)), so this works on personal accounts. Spotify's developer policy forbids analysing listening to build user metrics, so Stability reads music through [Last.fm's API](https://www.last.fm/api/tos), which allows non-commercial use. Screen time needs the native app in `native/`.

**If the teen turns Stability off.** They can, in one step, and no note goes out, unless "Are you safe right now?" is open (see above). After 26 hours without a `status` event, the parent app shows "Not connected". When the Stability keyboard has not been used that day, it shows "On, but the Stability keyboard isn't in use, so typed words aren't checked."

## In the demo

- **Scene 3** keeps its counter, TEXT SENT: 0 BYTES, and adds a second line, ALERTS SENT, with the size of each event.
- **Scene 5** shows two phones. Maya's screen shows the doctor suggestion and nothing else. The amber light crosses to her mother's phone, where the heads-up appears word by word.
- **Maya's story changes at setup and from week 4.** Her mother scans the code, and Maya reads the setup screen and answers the eight questions alone. She checks in every week. At the monthly ask in week 4 her two answers total 2, under the cut-off of 3, and she is taken at her word. During finals her check-ins get more stressed. In week 6 the ask model's score reaches its threshold, so Stability asks again and does not wait for week 8. Her answers are still under the cut-off. At the end of week 8 it asks again, her two answers are high and her score on the eight is 10 or more. She never writes a letter. Her mother gets the heads-up that night, starts the conversation on a drive, and taps "Booked a doctor". Weeks 9 to 12 stay as they were: they see the pediatrician, and Maya shows the doctor her chart.
- **The app screens change.** The letter screen goes. The parent app has three screens: the note, what to say, and the reply buttons. The teen's help screen is as described above.

## What the experiments now measure

**Experiment 1, timing.** A false alarm now reaches a parent, so it costs more than the ten seconds it used to. At the heads-up threshold we will report alerts per student per year, the share of alerts that land in weeks with high mood scores, and low periods that get no alert. Each is compared with alerts sent on a fixed calendar at the same count. The four-week rule for skipped asks is tested on its own, using phone data only, because it will have the most false alarms. The four-week and three-week numbers are chosen on the training group of students and frozen before the test group is scored. High mood scores stand in for a note being right. They cannot show whether a note helped a family.

*Result.* Training students picked six weeks outside and a three-week cooldown. On the test students that gave 2.8 heads-ups a year, and 15.8% landed on a week with a high mood score, against 15.5% for a calendar sending the same number. The difference was within chance in all five splits, and 198 of 225 low periods got no heads-up. A heads-up from skipped questions has no evidence behind it yet. [Full write-up](../results/exp1/results.md).

**Experiment 4, the ask model.** This is the model that now decides when to ask sooner. On Dartmouth students it never saw, it scored an AUC of 0.89. At 12 asks per student per year, 44% of its asks landed on a week with a high mood score, against 13% for a fixed calendar. It missed 586 of 2,171 high weeks, and 2,012 of its asks landed on weeks that were not high. It finds who to ask more often and does not pick the week: random weeks from the same student and quarter reached 45%. A wrong ask costs the teen two questions. It never reaches a parent. [Full write-up](../results/exp4/results.md).

**Experiment 6, teenagers.** The same model, unchanged, on 113 teens aged 12 to 17 (Corona Health, University of Wurzburg). On each teen's first follow-up it scored an AUC of 0.85, and asking the top 23% landed on a high score 74% of the time, against 41% at random. It missed 14 of 46 high answers and raised 11 false alarms. The survey had no check-in, so this tests only the earlier answers. [Full write-up](../results/exp6/results.md).

**Experiment 2, words.** The tone model is tested as before. The self-harm phrase list gets its own small test: song lyrics, dark jokes and sarcasm we write, to count false flags, and messages we write that state real risk, to count misses.

*Result.* The phrase list missed 9 of 15 risk messages written by someone who had not seen it, including 5 of 9 that state a plan or an act already done. It flagged 4 of 24 jokes, lyric-style lines and sarcasm, all as concern. Most misses were one word off a rule. The list shipped in the app is the one that was tested. [Full write-up](../results/exp2/results.md).

**Experiment 5, a model for self-harm language.** Trained on 282,768 posts from two public Kaggle sets (r/SuicideWatch against r/teenagers, and a set with Depression, Anxiety, Stress and Suicidal labels). Depression, anxiety and stress posts count as not self-harm, so the model has to tell self-harm language apart from sadness. We wrote the rule for adding it to the app before we ran it.

*Result.* On 28,277 posts it never saw, it found 92% of self-harm posts at 90% precision (989 missed, 1,316 false alarms). The phrase list found 52% at 92% (6,075 missed, 596 false alarms). On our 60 messages the phrase list plus the model found 13 of 15 risk messages, against 6 for the list alone, with 5 false alarms against 4: the same four dark jokes and one sad message. It passed the rule, so the app runs it. The cost: it flagged 32% of depression posts, against 20% for the list, so a sad teen will more often be asked if they are safe. A clinician has to review this before anyone relies on it. [Full write-up](../results/exp5/results.md).

**Experiment 5b, the self-harm model on labels from psychiatrists.** Experiment 5's labels come from the forum a post was in, and one of its sets uses r/teenagers as the "not suicidal" side, so the model could have learned the forum instead of the risk. We tested it, unchanged, on 500 Reddit users whose posts four psychiatrists rated on the Columbia Suicide Severity Rating Scale ([Gaur et al., 2019](https://zenodo.org/records/4543776), CC BY 4.0). All of them posted in the same forums, so the forum cannot give the answer away.

*Result.* It ranked the 293 users at risk (ideation, behavior or an attempt) above the rest at an AUC of 0.66. Counting a user as flagged when any of their posts is flagged, it flagged 99% of users at risk, but also 86% of users who were only supporting others and 91% of users with only indicators of risk. The phrase list flagged 70% of users at risk and 45% of supportive users. The model learned the language of suicide, not the risk: "please don't kill yourself" reads the same as a crisis. So a flag from the model alone now only asks the teen, as in the table above. [Full write-up](../results/exp5b/results.md).

## What this does not solve

- **The parent may be the danger.** For a teen who is abused at home, or who is not out to their family, a note to that parent can make things worse. The trusted adult the teen names gets urgent notes too, and the help screen lists Childhelp and The Trevor Project. Heads-ups still go only to the parent. Whether a teen should be able to send notes away from an unsafe parent is an open question for a clinician and a lawyer, and the demo assumes a safe parent.
- **Notes can still be wrong.** The rules above make false alarms rarer, and the wording keeps each one small. They will still happen.
- **Knowing a parent is linked may change what the teen types and answers.** A teen who knows a high score sends a note may answer low on purpose. A low answer pauses asking, so the four-week rule for skipped asks does not catch this. We will show the setup screen to classmates and ask whether they would keep Stability on.
- **The urgent path may not be allowed on iPhone.** [Apple's rule 4.4.1](https://developer.apple.com/app-store/review/guidelines/) lets a keyboard use what is typed only to improve the keyboard, and a keyboard cannot open other apps. On an iPhone the question and 988 would have to appear inside the keyboard, and a flag reaching a parent may break the rule.
- **The law.** A real product would hold health information about minors and share some of it with a parent. It needs legal review before launch, and we have not had one.

*This project is a prototype and is not medical advice. It was drafted with Claude (Anthropic), and no clinician has reviewed it. Sources are linked where each one is used; all were opened on November 14, 2026.*
