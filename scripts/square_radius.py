import re,glob,sys
files=[f for f in glob.glob('app/**/*.tsx',recursive=True)+glob.glob('src/**/*.tsx',recursive=True)]
TARGET={14,15,16,17,18,19,20,22,24,26,28}
changed=0;skipped=[]
for f in files:
    s=open(f).read();out=[];last=0
    for m in re.finditer(r'borderRadius:\s?(\d+)\b',s):
        n=int(m.group(1))
        if n not in TARGET: continue
        win=s[max(0,m.start()-160):m.end()+160]
        if re.search(r'\b(width|height|minWidth|minHeight):\s?%d\b'%(2*n),win):
            skipped.append((f,n));continue
        out.append((m.start(),m.end()))
    if not out: continue
    ns='';p=0
    for a,b in out: ns+=s[p:a]+'borderRadius: 10';p=b
    ns+=s[p:];open(f,'w').write(ns);changed+=len(out)
print('changed',changed,'skipped',len(skipped));[print(x) for x in skipped]
