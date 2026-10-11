from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlencode
import subprocess
def fetch(url):
 return subprocess.run(["curl","-sSfL","--max-time","40","-A","Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",url],capture_output=True,check=True).stdout
import re
root=Path(__file__).resolve().parents[1]
class Text(HTMLParser):
 def __init__(self): super().__init__(); self.parts=[]
 def handle_data(self,s): self.parts.append(s)
p=Text();p.feed((root/'dist/index.html').read_text())
text=''.join(sorted(set(''.join(p.parts))))
fonts=[('Noto Serif SC:wght@700','noto-serif-sc',text),('Noto Sans SC:wght@400;600','noto-sans-sc',text),('Instrument Serif:ital@1','instrument-serif-italic',None),('Inter:wght@400;500;600','inter',None)]
for family,name,subset in fonts:
 query={'family':family,'display':'swap'}
 if subset: query['text']=subset
 css=fetch('https://fonts.googleapis.com/css2?'+urlencode(query)).decode()
 urls=re.findall(r'url\((https:[^)]+)\)',css)
 for i,url in enumerate(dict.fromkeys(urls)):
  data=fetch(url); ext='woff2' if data[:4]==b'wOF2' else 'ttf' if data[:4]==b'\x00\x01\x00\x00' else 'woff'
  filename=f'{name}-{i}.{ext}';(root/'dist/assets/fonts'/filename).write_bytes(data);css=css.replace(url,'assets/fonts/'+filename)
 (root/'dist/assets/fonts'/f'{name}.css').write_text(css)
 print(name,len(urls),'files')
