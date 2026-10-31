"""Encode actual captured browser frames; OpenCV is an optional authoring tool."""
from pathlib import Path
import json, cv2, math, sys
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parents[1]
record=json.loads((root/'.local/demo-recording/recording.json').read_text(encoding='utf-8'))
out=root/'docs/media';out.mkdir(parents=True,exist_ok=True)
frames=record['frames'];fps=5
writer=cv2.VideoWriter(str(out/'team-room-demo.webm'),cv2.VideoWriter_fourcc(*'VP80'),fps,(1280,720))
assert writer.isOpened(),'VP8 encoding unavailable'
at=0
for n in range(math.ceil(record['duration']*fps)):
    while at+1<len(frames) and frames[at+1]['time']<=n/fps:at+=1
    frame=cv2.imread(frames[at]['file']);assert frame is not None
    writer.write(frame)
writer.release()
def stamp(seconds):
    ms=round(seconds*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'
for lang,key in [('en','text'),('ko','ko')]:
    chunks=['WEBVTT\n']
    for n,row in enumerate(record['chapters']):
        end=record['chapters'][n+1]['time'] if n+1<len(record['chapters']) else record['duration']
        chunks.append(f'{stamp(row["time"])} --> {stamp(end)}\n{row[key]}\n')
    (out/f'team-room-demo.{lang}.vtt').write_text('\n'.join(chunks),encoding='utf-8')
cap=cv2.VideoCapture(str(out/'team-room-demo.webm'));assert cap.isOpened();count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT));rate=cap.get(cv2.CAP_PROP_FPS);ok,_=cap.read();cap.release();assert ok and count>=250 and rate==fps
print(json.dumps({'video':str(out/'team-room-demo.webm'),'seconds':count/rate,'bytes':(out/'team-room-demo.webm').stat().st_size,'frames':count}))
