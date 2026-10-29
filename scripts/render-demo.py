"""Encode actual CUA browser capture clips into a captioned submission video.

No generated or reconstructed application screens are used. Source frames and
timestamps remain in artifacts/demo/clips for audit/re-editing.
"""
from pathlib import Path
from functools import lru_cache
import json
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'demo'
FRAMES = OUT / 'edited-frames'
FRAMES.mkdir(parents=True, exist_ok=True)
FFMPEG = ROOT / '.tools/video/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
W, H = 1440, 1080
BG, INK, MINT = '#EDEEF0', '#1F1F1F', '#94D2C9'
FONT = 'C:/Windows/Fonts/malgun.ttf'
BOLD = 'C:/Windows/Fonts/malgunbd.ttf'
@lru_cache(maxsize=20)
def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)

SCENES = {
 '01-intro': ('01  아이디어', '머릿속 아이디어를 대장 달그락에게 이야기합니다.', 3),
 '02-idea': ('01  아이디어', '완성된 명세서가 없어도, 일상의 말로 시작합니다.', 4),
 '03-chief-thinking': ('01  아이디어', '실제 AI 응답 생성 · 대기 구간 일부 단축', 2),
 '04-brainstorm': ('01  아이디어', '프로젝트 제목을 만들고, 빠진 요구사항을 질문합니다.', 5),
 '05-maker-profile': ('02  제작 프로필', '보유 도구와 펌웨어 경험을 확인해 설명을 맞춥니다.', 5),
 '06-profile-shared': ('02  제작 프로필', '확인한 조건은 프로젝트와 팀 공통 기록에 남습니다.', 3),
 '07-circuit-generating': ('03  회로 계획', '회로·펌웨어 초안 생성과 초기 평가 · 대기 구간 단축', 2),
 '08-circuit-result': ('03  회로 계획', '회로 연결과 검토 결과를 먼저 확인합니다.', 6),
 '09-approve-circuit': ('04  3D 목업', '사용자가 회로 방향을 승인하면 3D 목업을 만듭니다.', 4),
 '10-rotate-3d': ('04  3D 목업', '목업을 직접 돌려보며 형태와 치수를 검토합니다.', 8),
 '11-approve-mockup': ('05  작업 분담', '3D 방향 승인 후, 사람과 AI가 할 일을 나눕니다.', 4),
 '12-team-and-tasks': ('05  작업 분담', 'HW·SW·ME·ID 중 프로젝트에 필요한 팀을 선택합니다.', 5),
 '13-bom': ('05  구매 준비', 'BOM과 구매 상태를 관리합니다. 실제 재고 확인은 별도입니다.', 5),
 '14-enter-workshop': ('06  대장간', '같은 대화를 이어가며 메인 작업실로 이동합니다.', 4),
 '15-team-request': ('06  대장간', '대장이 작업 순서를 조율하고 각 역할이 답변합니다.', 3),
 '16-team-thinking': ('06  대장간', '선택한 팀의 실제 AI 응답 생성 · 대기 구간 단축', 2),
 '17-team-replies': ('06  대장간', '대장·HW·ME가 동일한 프로젝트 조건을 공유합니다.', 7),
 '18-evaluator-request': ('07  Evaluator', '장비가 없어도, 가능한 대체 확인 방법을 함께 찾습니다.', 3),
 '19-evaluator-thinking': ('07  Evaluator', '실제 Opus 평가 응답 생성 · 대기 구간 단축', 2),
 '20-evaluator-result': ('07  Evaluator', '확인할 관측을 요청하고, 측정하지 않은 것은 미확정으로 남깁니다.', 7),
 '21-me-request': ('08  개별 작업실', '다른 방에서 논의한 8mm 조건을 ME에게 이어서 요청합니다.', 3),
 '22-me-thinking': ('08  개별 작업실', '실제 Sonnet 작업 파일 생성 · 대기 구간 단축', 2),
 '23-me-file': ('08  개별 작업실', '완결된 OpenSCAD 초안을 만들고 파일로 내려받습니다.', 7),
 '24-shared-record': ('08  팀 공통 기록', '개별 작업실의 변경 제안과 결과를 모든 역할이 함께 봅니다.', 5),
 '25-firmware': ('09  실제 제작으로', '펌웨어를 내려받아 IDE에서 실행하고 결과를 다시 알려줍니다.', 5),
}

def centered(draw, text, y, size, color=INK, bold=False):
    f = font(size, bold)
    width = draw.textbbox((0,0), text, font=f)[2]
    draw.text(((W-width)/2,y), text, font=f, fill=color)

def title_card(end=False):
    image = Image.new('RGB', (W,H), BG)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((90,72,W-90,H-72), radius=40, fill='white')
    logo = Image.open(ROOT/'asset/idle.png').convert('RGBA')
    logo.thumbnail((200,220))
    image.paste(logo,((W-logo.width)//2,170),logo)
    centered(draw,'달그락 대장간',435,64,bold=True)
    centered(draw,'생각을 손에 잡히게.',535,34)
    centered(draw,'아이디어 → 회로 → 3D → 팀과 함께 제작',630,29)
    draw.rounded_rectangle((385,732,1055,798),radius=20,fill=MINT)
    centered(draw,'프로토타입 실제 작동 시연' if not end else 'AI와 사람이 함께 만드는 제작 작업실',746,26,bold=True)
    centered(draw,'실제 웹 화면 · 실제 AI 응답 · 일부 대기 구간 단축',845,22,'#62676C')
    if end:
        centered(draw,'실물 검증 · IDE 실행 · 재고 확인은 사용자 확인 단계입니다.',891,20,'#62676C')
    return image

def frame_card(path, section, caption, index, total):
    if path.parent.name == '23-me-file' and (OUT/'capture-final.png').exists():
        path = OUT/'capture-final.png'  # Actual result view, reframed after scrolling to the generated code.
    source = Image.open(path).convert('RGB')
    image = Image.new('RGB',(W,H),BG)
    draw = ImageDraw.Draw(image)
    draw.text((48,18),'달그락 대장간',font=font(28,True),fill=INK)
    draw.text((1010,24),section,font=font(23,True),fill='#32645D')
    screen = ImageOps.contain(source,(1344,930),Image.Resampling.LANCZOS)
    x, y = (W-screen.width)//2, 77+(930-screen.height)//2
    image.paste(screen,(x,y))
    draw.line((48,65,W-48,65), fill='#D2D6D9', width=2)
    centered(draw,caption,1020,23)
    draw.rectangle((0,H-5,int(W*(index+1)/total),H),fill=MINT)
    return image

entries=[]
def add(image, duration, name):
    target=FRAMES/(name+'.png')
    image.save(target)
    entries.append((target,duration))

add(title_card(),4,'title')
available=[(key, value) for key,value in SCENES.items() if (OUT/'clips'/key/'frames.json').exists()]
for scene_index,(key,(section,caption,target_duration)) in enumerate(available):
    directory=OUT/'clips'/key
    metadata=json.loads((directory/'frames.json').read_text(encoding='utf8'))
    frames=metadata['frames']
    elapsed=metadata['elapsed']
    for i,item in enumerate(frames):
        next_time=frames[i+1]['time'] if i+1<len(frames) else elapsed
        duration=max(.001,next_time-item['time'])/elapsed*target_duration
        add(frame_card(directory/item['file'],section,caption,scene_index,len(available)),duration,key+'-'+str(i).zfill(5))
    print(f'{key}: {len(frames)} actual frames, {target_duration}s', flush=True)
add(title_card(True),5,'end')

manifest=OUT/'encode.ffconcat'
with manifest.open('w',encoding='utf8') as f:
    f.write('ffconcat version 1.0\n')
    for path,duration in entries:
        f.write("file '"+path.as_posix()+"'\n")
        f.write(f'duration {duration:.6f}\n')
    f.write("file '"+entries[-1][0].as_posix()+"'\n")
video=OUT/'dalgeurak-demo.mp4'
subprocess.run([str(FFMPEG),'-y','-v','warning','-f','concat','-safe','0','-i',str(manifest),'-vf','fps=24','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(video)],check=True)
title_card().save(OUT/'poster.png')
print(json.dumps({'video':str(video),'durationSeconds':sum(d for _,d in entries),'bytes':video.stat().st_size,'scenes':len(available)},ensure_ascii=False))
