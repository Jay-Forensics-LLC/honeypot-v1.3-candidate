rule Suspicious_Shell_Combination {
  meta:
    description = "Shell networking plus execution markers; triage only"
    severity = "HIGH"
  strings:
    $a = "/dev/tcp/" ascii
    $b = "bash -i" ascii
    $c = "socket.socket(" ascii
    $d = "os.dup2(" ascii
  condition:
    filesize < 20MB and (($a and $b) or ($c and $d))
}
rule Suspicious_Mining_Config {
  meta:
    description = "Mining configuration indicators; not family attribution"
    severity = "HIGH"
  strings:
    $a = "stratum+tcp://" ascii wide
    $b = "randomx" ascii wide nocase
    $c = "donate-level" ascii wide
  condition:
    filesize < 20MB and $a and 1 of ($b,$c)
}
