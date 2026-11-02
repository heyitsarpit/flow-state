#!/usr/bin/env python3 -I
# A LevelDB log file, read the way LevelDB's reader does, by hand: 32 KiB blocks, a 7-byte header (masked CRC32C, length, type) per fragment. Says where the first bad record is. python3 -I leveldb-log.py <file>...
import sys
T=[0]*256
for i in range(256):
    c=i
    for _ in range(8): c=(c>>1)^0x82F63B78 if c&1 else c>>1
    T[i]=c
def crc(b,c=0):
    c^=0xFFFFFFFF
    for x in b: c=T[(c^x)&255]^(c>>8)
    return c^0xFFFFFFFF
def unmask(m):
    r=(m-0xa282ead8)&0xFFFFFFFF
    return ((r>>17)|(r<<15))&0xFFFFFFFF
for path in sys.argv[1:]:
    d=open(path,'rb').read(); n=len(d); o=0; good=0; first=None
    while o<n:
        left=32768-(o%32768)
        if left<7: o+=left; continue
        if o+7>n: first=('short header at the end',o); break
        m=int.from_bytes(d[o:o+4],'little'); l=int.from_bytes(d[o+4:o+6],'little'); t=d[o+6]
        if t==0 and l==0:
            z=d[o:o+left]
            first=('zeros to the block end' if not any(z) else 'zero type with data',o); break
        if o+7+l>n: first=(f'a record of {l} bytes cut by the end of file',o); break
        if crc(d[o+6:o+7+l])!=unmask(m):
            first=(f'CHECKSUM MISMATCH on a whole record, length {l}, type {t}',o); break
        good+=1; o+=7+l
    tail=None
    if first:
        tail=n-first[1]
    print(f'{path.split("/")[-1]} size {n}: {good} good fragments; first problem: {first[0] if first else "none"}'+(f' at {first[1]}, {tail} bytes before the end; zero bytes after it: {d[first[1]:].count(0)}/{tail}' if first else ''))
