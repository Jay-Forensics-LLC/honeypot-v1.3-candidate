"""Small wholly synthetic network fixtures. No capture from an observed endpoint."""
import ipaddress
import struct

SRC='192.0.2.10'; DST='198.51.100.20'; MAC='02:00:00:00:00:01'

def addr(s): return ipaddress.ip_address(s).packed

def checksum(data):
    if len(data)%2: data+=b'\0'
    n=sum(struct.unpack('!'+str(len(data)//2)+'H',data)); n=(n&65535)+(n>>16); n=(n&65535)+(n>>16)
    return (~n)&65535

def eth(data,typ=0x800,vlan=None):
    head=bytes.fromhex('020000000002020000000001')
    if vlan is not None: return head+struct.pack('!HHH',0x8100,vlan,typ)+data
    return head+struct.pack('!H',typ)+data

def ipv4(data,proto=17,src=SRC,dst=DST,frag=0):
    head=struct.pack('!BBHHHBBH4s4s',0x45,0,len(data)+20,1,frag,64,proto,0,addr(src),addr(dst))
    head=head[:10]+struct.pack('!H',checksum(head))+head[12:]
    return head+data

def udp(data,sport=50000,dport=53): return struct.pack('!HHHH',sport,dport,len(data)+8,0)+data

def tcp(data=b'',sport=50000,dport=443,flags=2):
    return struct.pack('!HHIIBBHHH',sport,dport,1,0,0x50,flags,65535,0,0)+data

def qname(name): return b''.join(bytes([len(p)])+p.encode() for p in name.split('.'))+b'\0'

def dns_question(name='example.test'): return struct.pack('!6H',1,0x100,1,0,0,0)+qname(name)+struct.pack('!HH',1,1)

def dns_answer(name='example.test'):
    return struct.pack('!6H',1,0x8180,1,1,0,0)+qname(name)+struct.pack('!HH',1,1)+b'\xc0\x0c'+struct.pack('!HHIH',1,1,30,4)+addr(DST)

def arp(address=SRC,mac='020000000001'):
    return eth(struct.pack('!HHBBH',1,0x800,6,4,2)+bytes.fromhex(mac)+addr(address)+bytes.fromhex('020000000002')+addr(DST),0x806)

def dhcp(lease=60,mac='020000000001'):
    body=bytearray(240); body[:4]=b'\x02\x01\x06\0'; body[4:8]=b'\0\0\0\x01'
    body[16:20]=addr(SRC); body[28:34]=bytes.fromhex(mac); body[236:240]=b'\x63\x82\x53\x63'
    body+=b'\x35\x01\x05\x33\x04'+struct.pack('!I',lease)+b'\xff'
    return eth(ipv4(udp(body,67,68),src=DST,dst='255.255.255.255'))

def ipv6(data,proto=58,src='2001:db8::1',dst='2001:db8::2',hop=255):
    return struct.pack('!IHBB16s16s',6<<28,len(data),proto,hop,addr(src),addr(dst))+data

def ndp():
    data=b'\x88\0\0\0'+b'\0'*4+addr('2001:db8::1')+b'\x02\x01'+bytes.fromhex('020000000001')
    return eth(ipv6(data),0x86dd)

def hello():
    name=b'example.test'; value=struct.pack('!H',len(name)+3)+b'\0'+struct.pack('!H',len(name))+name
    ext=struct.pack('!HH',0,len(value))+value
    body=b'\x03\x03'+b'\0'*32+b'\0'+b'\0\x02\x13\x01'+b'\x01\0'+struct.pack('!H',len(ext))+ext
    handshake=b'\x01'+len(body).to_bytes(3,'big')+body
    return b'\x16\x03\x01'+struct.pack('!H',len(handshake))+handshake

def pcap(items,endian='<',nano=False,link=1):
    magic=b'\x4d\x3c\xb2\xa1' if nano else b'\xd4\xc3\xb2\xa1'
    if endian=='>': magic=magic[::-1]
    header=magic+struct.pack(endian+'HHiiII',2,4,0,0,65535,link)
    result=[header]
    for index,item in enumerate(items):
        when,data=item if isinstance(item,tuple) else (1700000000+index,item)
        sec=int(when); fraction=round((when-sec)*(10**9 if nano else 10**6))
        result += [struct.pack(endian+'IIII',sec,fraction,len(data),len(data)),data]
    return b''.join(result)

def block(typ,body,endian='<'):
    body+=b'\0'*((-len(body))%4); n=len(body)+12
    return struct.pack(endian+'II',typ,n)+body+struct.pack(endian+'I',n)

def section(endian='<',length=-1):
    return block(0x0a0d0d0a,struct.pack(endian+'IHHq',0x1a2b3c4d,1,0,length),endian)

def interface(endian='<',link=1,resolution=6,offset=0):
    options=struct.pack(endian+'HH',9,1)+bytes([resolution])+b'\0'*3
    options+=struct.pack(endian+'HHq',14,8,offset)+b'\0'*4
    return block(1,struct.pack(endian+'HHI',link,0,65535)+options,endian)

def epb(data,*,endian='<',iface=0,ticks=1700000000000000):
    return block(6,struct.pack(endian+'IIIII',iface,ticks>>32,ticks&0xffffffff,len(data),len(data))+data,endian)

def spb(data,endian='<'):
    return block(3,struct.pack(endian+'I',len(data))+data,endian)
