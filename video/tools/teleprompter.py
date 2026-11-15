"""Build script/teleprompter.html from script/script.json: one card per section, in big type."""
import html, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = json.load(open(f"{ROOT}/script/script.json"))
words = sum(len(s["text"].split()) for s in S)
cards = []
for i, s in enumerate(S, 1):
    cards.append(f'''<section class="card" data-i="{i}">
  <div class="meta"><span class="num">{i} / {len(S)}</span><span class="lab">{html.escape(s["label"])}</span></div>
  <p class="line">{html.escape(s["text"])}</p>
  <div class="show">On screen: {html.escape(s["show"])}</div>
</section>''')
page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stability teleprompter</title>
<style>
:root{{--bg:#0E1114;--ink:#F4F2EC;--soft:rgba(244,242,236,.6);--acc:#F2A33A;--grn:#5FAE8B}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:500 20px/1.4 Inter,system-ui,-apple-system,sans-serif}}
.card{{display:none;min-height:100vh;padding:5vh 7vw;flex-direction:column;justify-content:center}}
.card.on{{display:flex}}
.meta{{display:flex;gap:18px;align-items:center;font:600 16px ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--soft)}}
.num{{color:var(--acc)}}
.line{{font-size:clamp(30px,4.2vw,58px);line-height:1.32;font-weight:600;margin:28px 0 36px;max-width:24em}}
.show{{color:var(--soft);font-size:18px}}
.intro h1{{font-size:44px;margin:0 0 18px}}.intro li{{margin:10px 0;font-size:22px;max-width:44em}}.intro b{{color:var(--acc)}}
.keys{{position:fixed;bottom:16px;right:22px;color:var(--soft);font:14px ui-monospace,Menlo,monospace}}
</style></head><body>
<section class="card on intro" data-i="0"><div>
<h1>Recording the voice for the Stability video</h1>
<ul>
<li><b>What to record:</b> sound only. Voice Memos on a phone is fine, or QuickTime, File, New Audio Recording.</li>
<li><b>Where:</b> a quiet room with soft things in it (a bedroom beats a kitchen). Hold the phone about a hand's length from your mouth.</li>
<li><b>How:</b> one recording, start to finish. Press the right arrow or space for the next card and pause two seconds between cards.</li>
<li><b>Messed up a line?</b> Pause, then say that whole card again from its first word and carry on. The last clean take of each card is the one that gets used.</li>
<li><b>Pace:</b> calm and clear, a little slower than talking to a friend. The {words} words should take about 1 minute 45 seconds. The limit is 2 minutes.</li>
<li><b>Two voices?</b> You can take turns card by card. Keep it one file, or one file each, in card order.</li>
<li><b>Then:</b> put the file in <b>video/takes/</b> and run <b>python3 tools/ingest_audio.py takes/your-file.m4a</b>, then render again. The pictures re-time themselves to your voice.</li>
</ul></div></section>
{''.join(cards)}
<div class="keys">right arrow or space: next · left arrow: back</div>
<script>
let i=0;const cs=[...document.querySelectorAll('.card')];
const go=n=>{{i=Math.max(0,Math.min(cs.length-1,n));cs.forEach((c,k)=>c.classList.toggle('on',k===i));}};
addEventListener('keydown',e=>{{if(['ArrowRight',' ','PageDown','Enter'].includes(e.key)){{e.preventDefault();go(i+1)}}if(['ArrowLeft','PageUp'].includes(e.key)){{e.preventDefault();go(i-1)}}}});
addEventListener('click',e=>go(e.clientX>innerWidth/3?i+1:i-1));
</script></body></html>'''
open(f"{ROOT}/script/teleprompter.html", "w").write(page)
print("teleprompter:", len(S), "cards,", words, "words")
