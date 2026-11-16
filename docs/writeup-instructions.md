# Write-up instructions (Veritas AI Hackathon 2026)

From the hackathon's *Project Briefs* (page 18) and *Hacker Guide* (page 11). Our write-up is [WRITEUP.md](../WRITEUP.md).

## The template

"Copy this into your Google Doc or README."

```
# Project name
**Track:** Health / Finance / Climate / Languages
**Team:** names

## The problem
Who has this problem, and why does it matter? (2-3 sentences)

## What we built
What goes in, what comes out, and how someone would use it.

## What we added
If you started from a suggested project: which one, and what you added
or changed (your own user, data or question). Otherwise, write "Our own idea".

## How it works
Data: which dataset, how many examples, how we cleaned it.
Model: what we used and why.

## Results
Our baseline scored X. Our model scored Y on held-out test data.
Where it fails, and why we think so.

## What we'd do next
One or two concrete next steps with more time.

## Sources
Datasets, pretrained models, tutorials and AI tools used, with links.
```

## Rules that apply to the write-up

- **Length:** about one page.
- **Cite everything:** every dataset, pretrained model, code source, tutorial and AI tool, with links.
- **Health and finance projects:** say that it is a prototype and not medical or financial advice. For us: *"This project is a prototype and is not medical advice."*
- **Honest results:** report the results you actually got, including weak ones.
- **Health track:**
  - report missed cases and false alarms separately;
  - check performance across groups (for example age and sex);
  - use public datasets only.
- **What every project shows:**
  - one named user;
  - a real input producing a result;
  - the model against a simple baseline on held-out test data;
  - at least one failure example.
- **AI tools:** allowed, but list them. The team must understand every part and be able to explain it to the judges.
- **Judging:** Round 1 is reviewed blind, without names or schools.

## Our write-up against the checklist

| Requirement | In WRITEUP.md |
| --- | --- |
| Template headings, in order | Yes |
| Prototype line | Yes, under the title |
| Named user | Maya, 16 |
| Real input to output | Maya's twelve weeks: check-ins and answers in, a doctor nudge and a parent note out |
| Model vs simple baseline, held-out | Results table: ask model vs fixed schedule, mood model vs keyword list, self-harm model vs phrase list |
| Missed cases and false alarms, separately | Results table |
| At least one failure | The drift rule (14.6% vs 14.9%), and the self-harm model on psychiatrist labels |
| Group check | Teens (boys and girls), college (men and women), race |
| Sources and AI tools | Sources section |
| About one page | About 1,190 words, slightly over |
| Team names | "Two high school students (names are on the submission form)", kept out for blind judging |

## The demo video (optional, up to 2 minutes)

Suggested structure:

| Part | Length | What to show |
| --- | --- | --- |
| The problem | About 15 s | Who your project is for and why it matters |
| The demo | About 60 s | A real input going in and the result coming out |
| How it works | About 30 s | Your data, your model and how it compares with the baseline |
| Next steps | About 15 s | One limitation and what you'd do next |

Ours follows a pitch structure instead (Maya's story, the demo, the engine, the numbers). The limits and next steps are in the write-up.

## Submission

- Working code: a public GitHub repo or Colab notebook, with outputs visible.
- The write-up (Google Doc or README).
- A demo video link (YouTube unlisted, or shared from Google Drive).
- The names of all team members.
- Citations for every dataset, model and code source.
- Deadline: Sunday 2026-11-15, 11:59 PM ET (8:59 PM PT). You can resubmit until the deadline; judges look at the latest version.
