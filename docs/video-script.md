# Demo video script

A two-minute screen recording with one voice over it, in the four parts the hackathon guide suggests. The words below come to about 280, which is two minutes at an unhurried pace. Every number is from [the write-up](../WRITEUP.md).

## Before recording

1. Start the app: `cd app && npm install && npm run dev -- --port 5210`, then open http://localhost:5210.
2. Make the browser window about 1500 pixels wide, so both phones and the control rail show.
3. Choose "Maya's 12 weeks", leave "Scripted answers and replies" ticked, and press Reset.
4. Practise once. Play reaches week 8 about 20 seconds after you press it.

## The script

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 to 0:15 | The two phones at setup, nothing pressed yet | "One in five American teenagers goes through depression in a year, and most get no treatment. It builds slowly, with a little less sleep and fewer texts, so nobody notices. This is Maya. She's sixteen. And this is her mom's phone." |
| 0:15 to 0:35 | Press **Play**. Weeks 1 to 6 go by on Maya's chart | "Steady runs on Maya's phone. For four weeks it learns her normal: her sleep, how often she messages people, how active she is. During finals those signals drift, so Steady asks her two screening questions, the same ones doctors use. She answers low, and Steady takes her at her word." |
| 0:35 to 0:55 | Week 8: the amber dot crosses to Mom's phone and the note appears. Press **Pause** | "But her sleep and messaging stay down. At week eight her answers come back high. Maya sees a suggestion to see a doctor, and her mom gets this note. It says what changed, for how long, and how to start the conversation. It never contains Maya's messages, answers or scores." |
| 0:55 to 1:15 | On Maya's phone open **Type**, type "nothing feels fun anymore", press Send. Point at TEXT SENT: 0 BYTES | "What Maya types is scored on her own phone by our tone model, then thrown away. Text sent: zero bytes." |
| 1:15 to 1:45 | The chart from [Experiment 3](../results/exp3/hit_rates.png), or the right-hand rail scrolled to **How we know** | "The tone model learned from forty-three thousand Reddit comments. On five thousand it had never seen, it found 55 percent of the low-mood ones. A keyword list found 24. For timing we used phone data from 213 Dartmouth students, and here our own idea failed. Phone signals picked the week to ask no better than chance. What worked was asking. With twelve asks a year, a calendar sent 13 percent of them to a hard week. One short check-in sent 24." |
| 1:45 to 2:00 | Back on the two phones | "So next, Steady will ask everyone on a calendar, add a one-tap check-in each week, and ask more often when check-ins are low. Our self-harm phrase list missed 9 of 15 test messages, so that part needs a real model and a clinician. This is a prototype, and it is not medical advice." |

## After recording

- Keep it at or under two minutes; the limit is firm.
- Upload it to YouTube as unlisted, or share it from Google Drive with "anyone with the link can view".
- Open the link in a private window to check that it plays without signing in.
