# Custom Domain Setup: sentinel-forensics.jayforensics.com

## Overview
This guide walks through configuring the custom domain `sentinel-forensics.jayforensics.com` for the Sentinel Forensics app hosted on Base44.

**Primary Domain:** `sentinel-forensics.jayforensics.com`  
**Base44 App URL:** `[your-app-id].base44.app`  
**DNS Provider:** Cloudflare  
**SSL/TLS:** Managed by Base44 + Cloudflare

---

## Step 1: Add Custom Domain in Base44

### Base44 Dashboard Configuration

1. **Navigate to Base44 Dashboard:**
   - Go to: `https://base44.com/dashboard`
   - Select your Sentinel Forensics app

2. **Add Custom Domain:**
   - Go to: **Settings** → **Custom Domains**
   - Click **"Add Custom Domain"**
   - Enter: `sentinel-forensics.jayforensics.com`
   - Click **"Add Domain"**

3. **Note the DNS Targets:**
   Base44 will provide:
   - **CNAME Target:** (typically `[app-id].base44.app` or similar)
   - **Verification Record:** (TXT record for domain ownership verification)
   
   **CRITICAL:** Copy these exact values. You'll need them for Cloudflare DNS.

4. **Wait for Verification:**
   - Status will show "Pending Verification"
   - After DNS is configured (Step 2), this will change to "Active"
   - SSL certificate will be auto-issued by Base44

---

## Step 2: Configure Cloudflare DNS

### Cloudflare Dashboard Configuration

1. **Log into Cloudflare:**
   - Go to: `https://dash.cloudflare.com`
   - Select domain: `jayforensics.com`

2. **Add CNAME Record:**
   - Go to: **DNS** → **Records**
   - Click **"Add record"**
   
   **Configuration:**
   ```
   Type:    CNAME
   Name:    sentinel-forensics
   Target:  [CNAME_TARGET_FROM_BASE44]
            (example: your-app-id.base44.app)
   TTL:     Auto
   Proxy:   DNS only (grey cloud) ⚠️ START WITH THIS
   ```
   
   ⚠️ **IMPORTANT:** Start with **DNS only** (grey cloud). Enable proxy AFTER verification.

3. **Add Verification Record (if required by Base44):**
   If Base44 provides a TXT verification record:
   ```
   Type:    TXT
   Name:    _base44-verify.sentinel-forensics
   Content: [VERIFICATION_TOKEN_FROM_BASE44]
   TTL:     Auto
   Proxy:   DNS only
   ```

4. **Save Changes:**
   - DNS propagation typically takes 1-5 minutes
   - Wait for Base44 to verify domain ownership

---

## Step 3: SSL/TLS Configuration

### Base44 SSL (Automatic)
- Base44 auto-issues Let's Encrypt SSL certificates for verified custom domains
- Check certificate status in Base44 dashboard under **Custom Domains**
- Wait for status: **"SSL Active"**

### Cloudflare SSL/TLS Settings
Once Base44 SSL is active:

1. **Go to:** Cloudflare → **SSL/TLS** → **Overview**
2. **Set SSL/TLS Encryption Mode:**
   ```
   Mode: Full (strict)
   ```
   
3. **Ensure Edge Certificates:**
   - Cloudflare → **SSL/TLS** → **Edge Certificates**
   - Universal SSL should be **Active**
   - Min TLS Version: **1.2** or higher

---

## Step 4: Enable Cloudflare Proxy (Optional)

**ONLY after SSL is verified stable:**

1. **Edit CNAME Record:**
   - Change proxy status from **DNS only** (grey) to **Proxied** (orange)
   
2. **Test for Redirect Loops:**
   ```bash
   curl -I https://sentinel-forensics.jayforensics.com
   ```
   
   Should return:
   ```
   HTTP/2 200
   ```
   
   **NOT:**
   ```
   HTTP/2 301  (redirect loop)
   ```

3. **If Redirect Loop Detected:**
   - Cloudflare → **SSL/TLS** → **Overview**
   - Change to: **Full (strict)** (if not already)
   - Cloudflare → **Rules** → **Page Rules**
   - Add rule: Always Use HTTPS (ensure no conflicting redirects)

---

## Step 5: Verification & Testing

### Health Check Endpoint
Test the custom domain:

```bash
# Health check
curl https://sentinel-forensics.jayforensics.com/health

# Expected response:
{
  "app": "sentinel-forensics",
  "status": "ok",
  "timestamp": "2026-01-21T...",
  "version": "1.0.0"
}
```

### Browser Testing
1. Visit: `https://sentinel-forensics.jayforensics.com`
2. Verify:
   - ✅ Page loads without errors
   - ✅ No certificate warnings
   - ✅ No redirect loops
   - ✅ Assets load correctly (CSS, JS, images)

### SSL Certificate Validation
```bash
# Check SSL certificate
openssl s_client -connect sentinel-forensics.jayforensics.com:443 -servername sentinel-forensics.jayforensics.com < /dev/null 2>/dev/null | openssl x509 -noout -text

# Or use online tool:
https://www.ssllabs.com/ssltest/analyze.html?d=sentinel-forensics.jayforensics.com
```

---

## Step 6: Monitoring Setup

### Uptime Monitoring
Set up monitoring for:
- **Endpoint:** `https://sentinel-forensics.jayforensics.com/health`
- **Expected Status:** 200
- **Check Interval:** 5 minutes
- **Alert On:** 3 consecutive failures

**Recommended Services:**
- UptimeRobot (free tier)
- Pingdom
- Cloudflare Health Checks (if using Workers)

---

## Troubleshooting

### Issue: Domain shows "Not Found" or 404
**Fix:**
- Verify CNAME target matches Base44 dashboard exactly
- Wait 5-10 minutes for DNS propagation
- Clear DNS cache: `ipconfig /flushdns` (Windows) or `sudo dscacheutil -flushcache` (macOS)

### Issue: SSL Certificate Warning
**Fix:**
- Ensure Base44 SSL status is "Active"
- Verify Cloudflare SSL mode is "Full (strict)"
- Wait for certificate issuance (can take 10-15 minutes)

### Issue: Redirect Loop (301/302)
**Fix:**
- Temporarily disable Cloudflare proxy (grey cloud)
- Check Base44 app doesn't have conflicting redirects
- Ensure Cloudflare SSL mode is "Full (strict)" not "Flexible"

### Issue: Assets not loading (CORS errors)
**Fix:**
- Ensure Cloudflare proxy is enabled (orange cloud)
- Check Base44 CORS settings allow custom domain
- Verify asset URLs use relative paths or correct domain

### Issue: DNS not propagating
**Check DNS:**
```bash
# Check CNAME
dig sentinel-forensics.jayforensics.com CNAME

# Check from different DNS server
dig @8.8.8.8 sentinel-forensics.jayforensics.com CNAME
```

---

## DNS Configuration Summary

**Cloudflare DNS Records:**

| Type  | Name                | Target/Content              | Proxy Status     |
|-------|---------------------|-----------------------------|------------------|
| CNAME | sentinel-forensics  | [base44-target]             | DNS only → Proxy |
| TXT   | _base44-verify.sentinel-forensics | [verification-token] | DNS only |

**After Verification:**
- Change CNAME proxy status to **Proxied** (orange cloud)
- Monitor for 24-48 hours for stability

---

## Security Checklist

- [ ] SSL/TLS certificate is valid and trusted
- [ ] HTTPS enforced (no HTTP access)
- [ ] Health endpoint returns 200
- [ ] No sensitive data in error responses
- [ ] CORS configured correctly
- [ ] CSP headers present (check Base44 settings)
- [ ] HSTS header enabled (Cloudflare → SSL/TLS → Edge Certificates)

---

## Maintenance

### Certificate Renewal
- Base44 auto-renews Let's Encrypt certificates (90 days)
- No manual intervention required
- Monitor expiry via SSL Labs or Cloudflare dashboard

### DNS Changes
- Keep Cloudflare TTL at Auto for flexibility
- Document any DNS changes in git commit messages
- Test changes in staging before production (if available)

---

## Support Contacts

**Base44 Support:**
- Dashboard: https://base44.com/dashboard
- Docs: https://docs.base44.com

**Cloudflare Support:**
- Dashboard: https://dash.cloudflare.com
- Docs: https://developers.cloudflare.com

---

## Quick Reference: DNS Propagation Check

```bash
# Check if DNS is propagated globally
https://dnschecker.org/#CNAME/sentinel-forensics.jayforensics.com

# Or use command line:
for ns in 8.8.8.8 1.1.1.1 208.67.222.222; do
  echo "Testing DNS server: $ns"
  dig @$ns sentinel-forensics.jayforensics.com CNAME +short
done
```

---

**Last Updated:** 2026-01-21  
**App Version:** 1.0.0  
**Base44 Platform Version:** V2